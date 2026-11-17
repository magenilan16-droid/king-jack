import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // נתיבים יחסיים - כדי שהאתר יעבוד בכל כתובת אחסון
  base: './',
  // מאפשר לפתוח מהטלפון ברשת הביתית לבדיקה
  server: { host: true },
})
