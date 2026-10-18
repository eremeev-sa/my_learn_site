const form=document.querySelector('#login-form');
const password=document.querySelector('#login-password');
document.querySelector('#toggle-password').addEventListener('click',event=>{
  password.type=password.type==='password'?'text':'password';
  event.currentTarget.textContent=password.type==='password'?'Показать':'Скрыть';
  event.currentTarget.setAttribute('aria-pressed',String(password.type==='text'));
});
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('[type=submit]'),error=document.querySelector('#login-error');
  button.disabled=true;button.textContent='Проверяем…';error.textContent='';
  try{
    const values=new FormData(form);
    const response=await fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:String(values.get('username')).trim(),password:String(values.get('password'))})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Не удалось войти');
    password.value='';location.replace('/');
  }catch(e){error.textContent=e.message;password.value='';password.focus();}
  finally{button.disabled=false;button.textContent='Войти →';}
});
