import './globals.css';
import './ui-refresh.css';
import './aurora.css';
import {THEME_BOOTSTRAP} from '../lib/theme.mjs';
export const metadata = {title: 'Discovery Workspace', description: 'A private prospect research workspace', robots: {index:false, follow:false}, icons: {icon:'/discovery-icon.ico?v=1', apple:'/discovery-logo.png?v=1'}};
export default function Layout({children}) {return <html lang="en" data-theme="dark" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:THEME_BOOTSTRAP}}/></head><body>{children}</body></html>;}
