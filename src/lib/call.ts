// שיחה חיה בשולחן: מי שמצטרף - המיקרופון שלו פתוח, וכל מי שבשיחה שומע את כולם (כמו שיחה קבוצתית).
// הקול עובר ישירות בין הטלפונים (WebRTC, מוצפן). השרת רק מכיר בין הטלפונים:
// מי בשיחה (נוכחות בערוץ שרק מי שיושב בשולחן מקבל את השם שלו), והחלפת "כרטיסי ביקור" (SDP) בין כל שניים.
// כשאין דרך ישירה (למשל בסלולר) הקול עובר דרך שרת ממסר (TURN) של Cloudflare.
import { useEffect, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, gameCall } from './supabase';
import { voiceOut } from './sound';

export type CallMember = { id: string; sid: string; muted: boolean };
export type CallSnap = {
  ready: boolean; // יש שיחה זמינה בשולחן הזה (אני יושב, והשרת נתן ערוץ)
  status: 'off' | 'joining' | 'on';
  muted: boolean;
  members: CallMember[]; // מי בשיחה עכשיו (כולל אני כשאני בפנים)
  links: Record<string, 'wait' | 'ok' | 'bad'>; // מצב החיבור שלי לכל אחד
  talking: string[]; // מי מדבר ברגע זה
};

const OFF: CallSnap = { ready: false, status: 'off', muted: false, members: [], links: {}, talking: [] };
let snap: CallSnap = OFF;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
function setSnap(next: CallSnap) {
  snap = next;
  subs.forEach((f) => f());
}

export const canCall = () => typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

const MIC: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

type Sig = { t: 'offer' | 'answer' | 'redo'; from: string; sid: string; to: string; toSid?: string; sdp?: string };
type Peer = {
  id: string;
  sid: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  offerer: boolean;
  tries: number;
  seen: boolean; // כבר הופיע ברשימת המשתתפים עם אותו מזהה חיבור
  born: number;
  timer?: number;
  talkUntil: number;
  reported?: boolean;
};

// דיווח לשרת איך החיבור עבר (ישיר / דרך ממסר / נכשל) - בלי תוכן, רק כדי לדעת אם זה עובד בטלפונים
function diag(d: Record<string, unknown>) {
  void gameCall({ op: 'callDiag', ...d }).catch(() => {});
}

// מחכים שהטלפון יאסוף את כל דרכי ההתחברות שלו (ישירה / דרך ממסר) - ושולחים הכל בהודעה אחת
function gathered(pc: RTCPeerConnection) {
  return new Promise<void>((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const done = () => {
      window.clearTimeout(t);
      pc.removeEventListener('icegatheringstatechange', chk);
      pc.removeEventListener('icecandidate', cand);
      res();
    };
    const chk = () => pc.iceGatheringState === 'complete' && done();
    const cand = (e: RTCPeerConnectionIceEvent) => !e.candidate && done();
    const t = window.setTimeout(done, 2500);
    pc.addEventListener('icegatheringstatechange', chk);
    pc.addEventListener('icecandidate', cand);
  });
}

const rnd = () => Math.random().toString(36).slice(2, 10);

class Session {
  ch: RealtimeChannel;
  sid = rnd();
  status: CallSnap['status'] = 'off';
  muted = false;
  stream: MediaStream | null = null;
  peers = new Map<string, Peer>();
  members: CallMember[] = [];
  links: CallSnap['links'] = {};
  talking: string[] = [];
  meter: { an: AnalyserNode; src: MediaStreamAudioSourceNode; buf: Uint8Array<ArrayBuffer>; until: number } | null = null;
  tick: number;
  dead = false;

  readonly myId: string;
  readonly ice: RTCIceServer[];

  constructor(myId: string, topic: string, ice: RTCIceServer[]) {
    this.myId = myId;
    this.ice = ice;
    this.ch = supabase.channel(topic, { config: { presence: { key: myId }, broadcast: { self: false } } });
    this.ch
      .on('presence', { event: 'sync' }, () => this.onPresence())
      .on('broadcast', { event: 'sig' }, ({ payload }) => void this.onSignal(payload as Sig))
      .subscribe((st) => {
        // גם אחרי ניתוק וחיבור מחדש (למשל חזרה לאפליקציה) - מודיעים שוב שאני בשיחה
        if (st === 'SUBSCRIBED' && this.status === 'on') void this.track();
      });
    this.tick = window.setInterval(() => this.poll(), 220);
    document.addEventListener('visibilitychange', this.onVisible);
    this.emit();
  }

  get joined() {
    return this.status === 'on';
  }

  emit() {
    if (this.dead) return;
    setSnap({ ready: true, status: this.status, muted: this.muted, members: this.members, links: { ...this.links }, talking: this.talking });
  }

  track() {
    return this.ch.track({ sid: this.sid, muted: this.muted, at: Date.now() });
  }

  send(m: Omit<Sig, 'from' | 'sid'>) {
    void this.ch.send({ type: 'broadcast', event: 'sig', payload: { ...m, from: this.myId, sid: this.sid } });
  }

  // ---------- הצטרפות / יציאה ----------
  async join() {
    if (this.status !== 'off' || this.dead) return;
    this.status = 'joining';
    this.emit();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: MIC });
    } catch (e) {
      this.status = 'off';
      this.emit();
      throw e;
    }
    if (this.dead || this.status !== 'joining') {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    this.muted = false;
    this.watchTrack();
    this.startMeter();
    this.status = 'on';
    this.emit();
    await this.track();
    this.reconcile();
  }

  leave() {
    if (this.status === 'off') return;
    this.status = 'off';
    void this.ch.untrack();
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.links = {};
    this.stopMeter();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.talking = [];
    this.emit();
  }

  setMuted(v: boolean) {
    if (!this.joined) return;
    this.muted = v;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !v));
    this.emit();
    void this.track();
  }

  destroy() {
    this.leave();
    this.dead = true;
    window.clearInterval(this.tick);
    document.removeEventListener('visibilitychange', this.onVisible);
    void supabase.removeChannel(this.ch);
    paintSeats([], [], []);
  }

  // ---------- מי בשיחה ----------
  onPresence() {
    const st = this.ch.presenceState() as Record<string, { sid?: string; muted?: boolean; at?: number }[]>;
    const list: CallMember[] = [];
    for (const [id, metas] of Object.entries(st)) {
      const m = [...metas].sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
      if (m?.sid) list.push({ id, sid: m.sid, muted: !!m.muted });
    }
    this.members = list;
    if (this.joined) this.reconcile();
    this.emit();
  }

  // מתחברים לכל מי שבשיחה. כדי ששניים לא יתקשרו זה לזה באותו רגע - תמיד מי שהמזהה שלו "קטן" יותר מתקשר
  reconcile() {
    const others = this.members.filter((m) => m.id !== this.myId);
    for (const [id, p] of [...this.peers]) {
      const m = others.find((x) => x.id === id);
      if (m && m.sid === p.sid) p.seen = true;
      else if (m || p.seen || Date.now() - p.born > 10000) this.drop(id);
    }
    for (const m of others) if (!this.peers.has(m.id) && this.myId < m.id) void this.call(m, 0);
  }

  makePeer(id: string, sid: string, offerer: boolean, tries: number): Peer {
    this.drop(id);
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.hidden = true;
    document.body.appendChild(audio);
    const p: Peer = { id, sid, pc, audio, offerer, tries, seen: false, born: Date.now(), talkUntil: 0 };
    if (this.stream) for (const t of this.stream.getAudioTracks()) pc.addTrack(t, this.stream);
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void audio.play().catch(() => {});
    };
    pc.oniceconnectionstatechange = () => this.onState(p);
    this.peers.set(id, p);
    this.links[id] = 'wait';
    return p;
  }

  drop(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    window.clearTimeout(p.timer);
    p.pc.ontrack = p.pc.oniceconnectionstatechange = null;
    try {
      p.pc.close();
    } catch {
      /* כבר סגור */
    }
    p.audio.srcObject = null;
    p.audio.remove();
    delete this.links[id];
  }

  async call(m: CallMember, tries: number) {
    const p = this.makePeer(m.id, m.sid, true, tries);
    this.emit();
    try {
      await p.pc.setLocalDescription(await p.pc.createOffer());
      await gathered(p.pc);
      if (this.peers.get(m.id) !== p) return;
      this.send({ t: 'offer', to: m.id, toSid: m.sid, sdp: p.pc.localDescription!.sdp });
      // אין תשובה - מנסים שוב
      p.timer = window.setTimeout(() => this.retry(p), 12000);
    } catch {
      this.retry(p);
    }
  }

  retry(p: Peer) {
    if (this.peers.get(p.id) !== p) return;
    const tries = p.tries + 1;
    this.drop(p.id);
    const m = this.members.find((x) => x.id === p.id);
    if (!this.joined || !m) return this.emit();
    if (tries > 4) {
      this.links[p.id] = 'bad';
      diag({ status: 'bad', relay: this.relay, n: this.members.length });
      return this.emit();
    }
    this.links[p.id] = 'wait';
    this.emit();
    window.setTimeout(() => {
      const cur = this.members.find((x) => x.id === p.id);
      if (this.joined && cur && !this.peers.has(cur.id) && this.myId < cur.id) void this.call(cur, tries);
    }, 700 * tries);
  }

  // החיבור נפל: מי שהתקשר מתקשר שוב, ומי שענה מבקש ממנו להתקשר שוב
  fail(p: Peer) {
    if (this.peers.get(p.id) !== p) return;
    if (p.offerer) return this.retry(p);
    this.send({ t: 'redo', to: p.id, toSid: p.sid });
    this.drop(p.id);
    this.links[p.id] = 'wait';
    this.emit();
  }

  onState(p: Peer) {
    if (this.peers.get(p.id) !== p) return;
    const s = p.pc.iceConnectionState;
    if (s === 'connected' || s === 'completed') {
      window.clearTimeout(p.timer);
      p.tries = 0;
      this.links[p.id] = 'ok';
      void p.audio.play().catch(() => {});
      if (!p.reported) {
        p.reported = true;
        window.setTimeout(() => void this.report(p), 1500);
      }
    } else if (s === 'failed') return this.fail(p);
    else if (s === 'disconnected') {
      window.clearTimeout(p.timer);
      this.links[p.id] = 'wait';
      p.timer = window.setTimeout(() => p.pc.iceConnectionState === 'disconnected' && this.fail(p), 6000);
    }
    this.emit();
  }

  async onSignal(m: Sig) {
    if (!this.joined || m.to !== this.myId || (m.toSid && m.toSid !== this.sid)) return;
    if (m.t === 'offer' && m.sdp) {
      const p = this.makePeer(m.from, m.sid, false, 0);
      this.emit();
      try {
        await p.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        await gathered(p.pc);
        if (this.peers.get(m.from) !== p) return;
        this.send({ t: 'answer', to: m.from, toSid: m.sid, sdp: p.pc.localDescription!.sdp });
        p.timer = window.setTimeout(() => this.links[p.id] !== 'ok' && this.fail(p), 15000);
      } catch {
        this.fail(p);
      }
    } else if (m.t === 'answer' && m.sdp) {
      const p = this.peers.get(m.from);
      if (!p || !p.offerer || p.sid !== m.sid || p.pc.signalingState !== 'have-local-offer') return;
      try {
        await p.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
      } catch {
        this.retry(p);
      }
    } else if (m.t === 'redo') {
      const p = this.peers.get(m.from);
      if (p?.offerer) this.retry(p);
      else if (!p) {
        const cur = this.members.find((x) => x.id === m.from);
        if (cur && this.myId < cur.id) void this.call(cur, 1);
      }
    }
  }

  get relay() {
    return this.ice.some((s) => String(s.urls).includes('turn'));
  }

  async report(p: Peer) {
    try {
      const st = await p.pc.getStats();
      type R = { type: string; selectedCandidatePairId?: string; nominated?: boolean; state?: string; localCandidateId?: string; remoteCandidateId?: string; candidateType?: string; protocol?: string };
      let pair: R | undefined;
      st.forEach((r: R) => {
        if (r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId);
      });
      if (!pair)
        st.forEach((r: R) => {
          if (!pair && r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r;
        });
      const l: R | undefined = pair?.localCandidateId ? st.get(pair.localCandidateId) : undefined;
      const r: R | undefined = pair?.remoteCandidateId ? st.get(pair.remoteCandidateId) : undefined;
      diag({ status: 'ok', local: l?.candidateType, remote: r?.candidateType, proto: l?.protocol, relay: this.relay, n: this.members.length });
    } catch {
      /* לא חשוב */
    }
  }

  // ---------- המיקרופון ----------
  // באייפון המיקרופון נסגר כשיוצאים מהאפליקציה. כשחוזרים - פותחים מחדש ומחליפים בכל החיבורים
  onVisible = () => {
    if (document.visibilityState !== 'visible' || !this.joined) return;
    for (const p of this.peers.values()) void p.audio.play().catch(() => {});
    window.setTimeout(() => {
      const t = this.stream?.getAudioTracks()[0];
      if (this.joined && (!t || t.readyState === 'ended' || t.muted)) void this.revive();
    }, 700);
  };

  watchTrack() {
    const t = this.stream?.getAudioTracks()[0];
    if (t) t.onended = () => this.joined && document.visibilityState === 'visible' && void this.revive();
  }

  async revive() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: MIC });
      if (!this.joined) return s.getTracks().forEach((t) => t.stop());
      const nt = s.getAudioTracks()[0];
      nt.enabled = !this.muted;
      for (const p of this.peers.values()) for (const snd of p.pc.getSenders()) if (!snd.track || snd.track.kind === 'audio') await snd.replaceTrack(nt).catch(() => {});
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = s;
      this.watchTrack();
      this.stopMeter();
      this.startMeter();
    } catch {
      /* ננסה שוב בפעם הבאה שחוזרים לאפליקציה */
    }
  }

  // מד עוצמה של המיקרופון שלי - כדי להאיר את המושב שלי כשאני מדבר
  startMeter() {
    const o = voiceOut();
    if (!o || !this.stream) return;
    try {
      const src = o.ctx.createMediaStreamSource(this.stream);
      const an = o.ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      this.meter = { an, src, buf: new Uint8Array(an.fftSize), until: 0 };
    } catch {
      this.meter = null;
    }
  }

  stopMeter() {
    try {
      this.meter?.src.disconnect();
    } catch {
      /* כבר מנותק */
    }
    this.meter = null;
  }

  // ---------- מי מדבר ----------
  poll() {
    const now = performance.now();
    const talk: string[] = [];
    if (this.joined) {
      const mt = this.meter;
      if (mt && !this.muted) {
        mt.an.getByteTimeDomainData(mt.buf);
        let sum = 0;
        for (const v of mt.buf) sum += ((v - 128) / 128) ** 2;
        if (Math.sqrt(sum / mt.buf.length) > 0.025) mt.until = now + 380;
        if (mt.until > now) talk.push(this.myId);
      }
      for (const p of this.peers.values()) {
        const r = p.pc.getReceivers()[0];
        const lvl = r?.getSynchronizationSources?.()[0]?.audioLevel ?? 0;
        if (lvl > 0.02) p.talkUntil = now + 380;
        if (p.talkUntil > now && !this.members.find((m) => m.id === p.id)?.muted) talk.push(p.id);
      }
    }
    if (talk.join() !== this.talking.join()) {
      this.talking = talk;
      this.emit();
    }
    paintSeats(
      this.members.map((m) => m.id),
      this.members.filter((m) => m.muted).map((m) => m.id),
      talk,
    );
  }
}

// מסמנים את המושבים בשולחן ישירות (בלי לרנדר מחדש את כל השולחן 4 פעמים בשנייה)
function paintSeats(inCall: string[], muted: string[], talking: string[]) {
  for (const el of document.querySelectorAll<HTMLElement>('.felt [data-pid]')) {
    const id = el.dataset.pid!;
    const set = (k: string, on: boolean) => {
      if (on && el.dataset[k] !== '1') el.dataset[k] = '1';
      else if (!on && k in el.dataset) delete el.dataset[k];
    };
    set('call', inCall.includes(id));
    set('mute', muted.includes(id));
    set('talk', talking.includes(id));
  }
}

let current: Session | null = null;

// מחבר את השולחן לשיחה (רק מי שיושב). ההצטרפות עצמה - רק בלחיצה
export function useTableCall(roomId: string, myId: string, seated: boolean) {
  useEffect(() => {
    if (!seated || !canCall()) return;
    let s: Session | null = null;
    let off = false;
    gameCall<{ topic?: string; iceServers?: RTCIceServer[] }>({ op: 'callInfo', roomId })
      .then((r) => {
        if (off || !r?.topic) return;
        current?.destroy();
        s = current = new Session(myId, r.topic, r.iceServers?.length ? r.iceServers : FALLBACK_ICE);
      })
      .catch(() => {});
    return () => {
      off = true;
      s?.destroy();
      if (current === s && s) {
        current = null;
        setSnap(OFF);
      }
    };
  }, [roomId, myId, seated]);
}

export const useCall = () => useSyncExternalStore(subscribe, () => snap);
export const callJoin = () => current?.join() ?? Promise.resolve();
export const callLeave = () => current?.leave();
export const callMute = (v: boolean) => current?.setMuted(v);
// הקלטת הודעה קולית באמצע שיחה משתמשת באותו מיקרופון (באייפון מיקרופון שני סוגר את הראשון)
export const callMicStream = () => (current?.joined ? current.stream : null);
