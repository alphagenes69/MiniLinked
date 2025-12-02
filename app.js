const API = 'http://localhost:4000/api';

let currentUser = null;

// Helper
async function api(path, opts={}) {
  const res = await fetch(API + path, opts);
  return res;
}

// Register
document.getElementById('btnRegister').addEventListener('click', async () => {
  const name = document.getElementById('reg_name').value;
  const email = document.getElementById('reg_email').value;
  const password = document.getElementById('reg_password').value;
  if(!name||!email||!password) return alert('Fill all fields');
  const res = await api('/auth/register', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({name,email,password})
  });
  const data = await res.json();
  if(res.ok) alert('Registered — now login');
  else alert(data.error || 'Error');
});

// Login
document.getElementById('btnLogin').addEventListener('click', async () => {
  const email = document.getElementById('login_email').value;
  const password = document.getElementById('login_password').value;
  const res = await api('/auth/login', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({email,password})
  });
  const data = await res.json();
  if(!res.ok) return alert(data.error || 'Login failed');
  // Save simple token = user id (for demo only)
  localStorage.setItem('token', data.token);
  currentUser = data.user;
  showProfile(currentUser.id);
});

// Show profile area
async function showProfile(userId) {
  const res = await api('/users/' + userId);
  if(!res.ok) { alert('Cannot load profile'); return; }
  const user = await res.json();
  currentUser = user;
  document.getElementById('auth').style.display = 'none';
  document.getElementById('profileSection').style.display = 'block';
  document.getElementById('userName').innerText = user.name;
  document.getElementById('userTitle').innerText = user.title || '';
  document.getElementById('userBio').innerText = user.bio || '';
  if (user.resume_filename) {
    document.getElementById('resumeInfo').innerText = user.resume_original_name || 'Resume uploaded';
    const link = `${API.replace('/api','')}/api/users/${user.id}/resume`;
    document.getElementById('downloadLink').href = link;
    document.getElementById('downloadLink').style.display = 'inline-block';
  } else {
    document.getElementById('resumeInfo').innerText = 'No resume uploaded';
    document.getElementById('downloadLink').style.display = 'none';
  }
}

// Upload resume
document.getElementById('btnUploadResume').addEventListener('click', async () => {
  const f = document.getElementById('resumeFile').files[0];
  if(!f) return alert('Choose a file first');
  if(!currentUser || !currentUser.id) return alert('Please login first');
  const fd = new FormData();
  fd.append('resume', f);
  document.getElementById('uploadStatus').innerText = 'Uploading...';
  const res = await fetch(`${API}/users/${currentUser.id}/resume`, {
    method:'POST',
    body: fd
  });
  const data = await res.json();
  if(res.ok) {
    document.getElementById('uploadStatus').innerText = 'Uploaded!';
    showProfile(currentUser.id);
  } else {
    document.getElementById('uploadStatus').innerText = 'Upload failed: ' + (data.error || 'error');
  }
});

// Logout
document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.removeItem('token');
  currentUser = null;
  document.getElementById('auth').style.display = 'block';
  document.getElementById('profileSection').style.display = 'none';
});

// Simple search
document.getElementById('btnSearch').addEventListener('click', async () => {
  const q = document.getElementById('q').value || '';
  const res = await fetch(`${API}/users?q=${encodeURIComponent(q)}`);
  const rows = await res.json();
  const out = document.getElementById('results');
  out.innerHTML = '';
  rows.forEach(u => {
    const div = document.createElement('div');
    div.className = 'user';
    div.innerHTML = `<b>${u.name}</b> <div>${u.title||''}</div>
      <div>Resume: ${u.hasResume ? 'Yes' : 'No'}</div>
      <button data-id="${u.id}" class="viewBtn">View</button>`;
    out.appendChild(div);
  });
  document.querySelectorAll('.viewBtn').forEach(b => b.addEventListener('click', async (e) => {
    const id = e.target.getAttribute('data-id');
    // show profile details in profileSection (but if you're not owner you can't upload)
    const r = await fetch(`${API}/users/${id}`);
    const u = await r.json();
    alert(`Name: ${u.name}\nTitle: ${u.title||''}\nHas resume: ${u.resume_filename ? 'Yes' : 'No'}`);
  }));
});

// Auto-load if token present (demo)
window.addEventListener('load', async () => {
  const token = localStorage.getItem('token');
  if (token) {
    // token is user id (demo)
    showProfile(token);
  }
});
