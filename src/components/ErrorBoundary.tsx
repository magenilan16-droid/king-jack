// רשת ביטחון: אם מסך נשבר - במקום מסך ריק מציגים הודעה עם כפתור לטעינה מחדש, ומדווחים על התקלה
import { Component, type ReactNode } from 'react';
import { reportCrash } from '../lib/crash';
import { tr } from '../lib/i18n';

export class ErrorBoundary extends Component<{ children: ReactNode; onHome?: () => void }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    reportCrash(err, info.componentStack ?? '');
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="screen center crash-screen">
        <div className="crash-box">
          <h2>{tr('משהו השתבש במסך הזה', 'Something went wrong on this screen')}</h2>
          <p>{tr('הפרטים נשלחו לתיקון. אפשר לטעון מחדש ולהמשיך לשחק.', 'The details were sent for a fix. Reload to keep playing.')}</p>
          <button className="btn primary block big" onClick={() => location.reload()}>
            {tr('טעינה מחדש', 'Reload')}
          </button>
          {this.props.onHome && (
            <button
              className="btn ghost block"
              onClick={() => {
                this.setState({ err: null });
                this.props.onHome?.();
              }}
            >
              {tr('חזרה ללובי', 'Back to the lobby')}
            </button>
          )}
        </div>
      </div>
    );
  }
}
