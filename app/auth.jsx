'use client';
import {useState} from 'react';
import {ShieldCheck,ArrowRight} from 'lucide-react';
import ThemeToggle from './theme-toggle';
export default function Auth({action,busy,error:serverError}) {
  const [mode,setMode]=useState('login'),[error,setError]=useState(''),[code,setCode]=useState('');
  function change(next){setMode(next);setError('');setCode('');}
  async function submit(e){
    e.preventDefault();setError('');const fields=Object.fromEntries(new FormData(e.currentTarget));
    if(mode!=='login'&&fields.password!==fields.confirm){setError('Passwords do not match.');return;}
    const result=await action({action:mode==='create'?'register':mode==='reset'?'resetPassword':'login',...fields});
    if(result?.recoveryCode)setCode(result.recoveryCode);
    else if(!result)setError(mode==='login'?'Unable to sign in. Check your username and password.':'Unable to continue. Check the details and try again.');
  }
  return <div className="auth"><div className="auth-theme"><ThemeToggle/></div><div className="auth-story"><a className="brand" href="/"><img className="brand-icon" src="/discovery-logo.png" width={37} height={37} alt=""/>Discovery Workspace</a><div><div className="eyebrow">LESS SEARCHING. BETTER CONVERSATIONS.</div><h1>Your next great<br/>client starts<br/><em>with discovery.</em></h1><p>A focused workspace for finding practices,<br/>spotting opportunities, and making the first move.</p></div><small>DISCOVERY WORKSPACE</small></div><div className="auth-form"><img className="brand-icon" src="/discovery-logo.png" width={48} height={48} alt="Discovery Workspace"/><h2>{code?'Save your recovery code':mode==='create'?'Create an account':mode==='reset'?'Reset your password':'Welcome back.'}</h2>
  {code?<><p>Your {mode==='reset'?'password has been reset':'account is ready'}. Store this code somewhere private. You’ll need it if you forget your password. It is shown only here; a reset replaces the previous code.</p><code className="recovery-code">{code}</code><button className="button primary" onClick={()=>change('login')}>I saved my code — sign in</button></>:<><p>{mode==='create'?'Choose a username and password for Discovery Workspace. Accounts share this local workspace.':mode==='reset'?'Enter your username, saved recovery code, and a new password.':'Sign in to Discovery Workspace.'}</p>{error&&<div role="alert" className="alert error">{serverError||error}</div>}<form key={mode} onSubmit={submit}>
    <label className="field"><span>Username</span><input name="name" required autoComplete="username" minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{2,31}"/></label>
    {mode==='reset'&&<label className="field"><span>Recovery code</span><input name="code" required autoComplete="off"/></label>}
    <label className="field"><span>{mode==='reset'?'New password':'Password'}</span><input name="password" type="password" required minLength={mode==='login'?undefined:12} maxLength={256} autoComplete={mode==='login'?'current-password':'new-password'}/></label>
    {mode!=='login'&&<><label className="field"><span>Confirm password</span><input name="confirm" type="password" required minLength={12} maxLength={256} autoComplete="new-password"/></label><small>Use at least 12 characters.</small></>}
    <button className="button primary" disabled={busy}>{busy?'Please wait…':mode==='create'?'Create account':mode==='reset'?'Reset password':'Sign in'}<ArrowRight size={17}/></button>
  </form><div className="auth-links">{mode==='login'?<><button onClick={()=>change('create')}>Create an account</button><button onClick={()=>change('reset')}>Forgot password?</button></>:<button onClick={()=>change('login')}>Back to sign in</button>}</div>{mode==='reset'&&<p>No recovery code? If you can still sign in, generate one in Settings. Email recovery is not configured for this local workspace.</p>}</>}
  <div className="auth-note"><ShieldCheck size={15}/>Private by default. Your research stays in your workspace.</div></div></div>;
}
export function RecoverySettings({action,busy}){
  const [code,setCode]=useState('');
  return <section className="panel padded"><h2>Account recovery</h2><p className="muted">Generate a private recovery code for your account. This replaces any previous code.</p><form onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;const result=await action({action:'renewRecovery',password:new FormData(form).get('password')});if(result){setCode(result.recoveryCode);form.reset();}}}><label className="field"><span>Current password</span><input name="password" type="password" autoComplete="current-password" required/></label><button className="button" disabled={busy}>Generate recovery code</button></form>{code&&<div role="status"><p>Save this code somewhere private before leaving this page.</p><code className="recovery-code">{code}</code></div>}</section>;
}
