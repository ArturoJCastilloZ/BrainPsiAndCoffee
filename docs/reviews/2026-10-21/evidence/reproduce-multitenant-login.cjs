const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=fs.readFileSync('src/auth/authService.js','utf8').replace(/^import .*;\n/gm,'').replace('export const authService = new AuthService();','globalThis.AuthServiceUnderReview = AuthService;');
let signedOut=false;
const user={id:'test-only',email:'test@example.invalid',app_metadata:{memberships:{clinic_a:'owner',clinic_b:'owner'}},user_metadata:{}};
const sb={auth:{onAuthStateChange(){},signInWithPassword:async()=>({data:{session:{user,access_token:'test'}}}),signOut:async()=>{signedOut=true},mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{}})}}};
class Subject { constructor(value){this.value=value} next(value){this.value=value} }
const ctx={env:{authWarningSeconds:60,authInactivityMinutes:15},ValueSubject:Subject,conCliente:async()=>sb,getSupabase:async()=>sb,hasSupabaseConfig:false,necesitaClienteAlArrancar:()=>false,peekSupabase:()=>sb,getSelectedTenant:()=>null,resolveInitialTenant:()=>null,setActiveTenant(){},resetRequests(){},canAccessAdmin:r=>r==='super_admin',canAccessDoctor:r=>r==='doctor',normalizeRole:r=>r==='owner'?'super_admin':r,window:{setTimeout:()=>1,clearTimeout(){}},atob,console};
vm.runInNewContext(src,ctx);
(async()=>{const service=new ctx.AuthServiceUnderReview();await assert.rejects(service.login({username:'test@example.invalid',password:'fixture'}),/no tiene permisos/);assert.equal(signedOut,true);console.log('CONFIRMED: valid credentials with two clinic memberships and no selected clinic are rejected and signed out before tenant selection. Mocked auth; no network or real account used.');})();
