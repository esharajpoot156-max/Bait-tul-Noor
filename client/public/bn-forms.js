/*
 * Bait-ul-Noor website -> CRM  (hosted on our own site, so the old website only needs ONE line)
 *
 * Add this single line before </body> in contact.html and donation.html:
 *     <script src="https://bait-tul-noor.vercel.app/bn-forms.js" defer></script>
 *
 * What it does by itself:
 *  - contact.html : finds the contact form (the one that posts to mail.php), makes the phone number
 *                   compulsory, and quietly sends a copy to the CRM. The normal email still works.
 *  - donation.html: adds an "Already donated? Let us know" form above the "Need Help?" section.
 *                   It only records a pledge. Staff verify the payment before any voucher exists.
 */
(function () {
  // >>> Put your Render backend address here (no "/" at the end) <<<
  var API_BASE = 'https://bait-tul-noor.onrender.com';
  var ENDPOINT = API_BASE + '/api/public/inquiry';

  // >>> The society's WhatsApp number, digits only with country code (92 = Pakistan, no + and no 0) <<<
  // IMPORTANT: use the SAME number that is connected to the CRM (WhatsApp Cloud API webhook),
  // otherwise the chat will not appear as a lead in the CRM.
  var WHATSAPP_NUMBER = '923222211911';

  function val(form, name) {
    var el = form.elements[name];
    return el ? String(el.value || '').trim() : '';
  }

  function send(payload) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true // lets the request finish even if the page changes
    });
  }

  // ---------------------------------------------------------- contact form --
  var contact = document.querySelector('form[data-bn-form="contact"], form[action$="mail.php"]');
  if (contact) {
    // The phone / WhatsApp number is compulsory, so every inquiry can reach the CRM.
    // The form is stopped (before the email is sent too) until a valid number is typed.
    var phoneInput = contact.elements['phone'];
    if (phoneInput) {
      phoneInput.required = true;
      phoneInput.setAttribute('inputmode', 'tel');
      var phoneLabel = phoneInput.id ? contact.querySelector('label[for="' + phoneInput.id + '"]') : null;
      if (phoneLabel && phoneLabel.textContent.indexOf('*') === -1) {
        phoneLabel.textContent = phoneLabel.textContent.trim() + ' *';
      }
      var checkPhone = function () {
        var value = phoneInput.value || '';
        var digits = value.replace(/\D/g, '');
        var ok = /^[+\d\s()-]+$/.test(value) && digits.length >= 10 && digits.length <= 15;
        phoneInput.setCustomValidity(
          ok ? '' : 'Please enter a valid phone / WhatsApp number (at least 10 digits).'
        );
      };
      phoneInput.addEventListener('input', checkPhone);
      checkPhone();
    }

    // The normal email (mail.php) still works exactly as before.
    // The CRM copy is sent quietly in the background and can never block the email.
    contact.addEventListener('submit', function () {
      try {
        var parts = ['Subject: ' + val(contact, 'subject')];
        var email = val(contact, 'email');
        if (email) parts.push('Email: ' + email);
        parts.push(val(contact, 'message'));

        send({
          submissionType: 'contact',
          donorName: val(contact, 'name'),
          phone: val(contact, 'phone'),
          notes: parts.join(' | ').slice(0, 490)
        }).catch(function () {});
      } catch (e) {}
    });
  }

  // ------------------------------------------------------- donation form -----
  var anchor =
    document.querySelector('.donation-container .help-section') ||
    document.querySelector('[data-bn-donation-here]');
  var container = anchor ? anchor.parentNode : document.querySelector('.donation-container');

  if (container) {
    var style = document.createElement('style');
    style.textContent =
      '.bn-inform{background:#fff;border:2px solid #e0e0e0;border-radius:15px;padding:40px;margin-bottom:40px}' +
      '.bn-inform h3{font-size:1.8rem;font-weight:800;color:var(--deep-blue,#0b3d91);margin:0 0 8px;text-align:center}' +
      '.bn-inform .bn-sub{color:#777;text-align:center;margin-bottom:25px}' +
      '.bn-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}' +
      '.bn-field{display:flex;flex-direction:column}.bn-field.bn-full{grid-column:span 2}' +
      '.bn-field label{font-weight:700;font-size:.9rem;color:#333;margin-bottom:6px}' +
      '.bn-field input,.bn-field select,.bn-field textarea{padding:12px 16px;border:2px solid #e0e0e0;border-radius:8px;font-size:1rem;font-family:inherit;background:#fafafa;outline:none}' +
      '.bn-field input:focus,.bn-field select:focus,.bn-field textarea:focus{border-color:var(--deep-blue,#0b3d91);background:#fff}' +
      '.bn-field textarea{min-height:90px;resize:vertical}' +
      '.bn-btn{grid-column:span 2;background:var(--deep-blue,#0b3d91);color:#fff;border:none;border-radius:8px;padding:14px;font-size:1.05rem;font-weight:700;cursor:pointer}' +
      '.bn-btn:hover{background:var(--red,#d32f2f)}.bn-btn:disabled{opacity:.6;cursor:not-allowed}' +
      '.bn-msg{display:none;margin-top:16px;padding:12px 16px;border-radius:8px;font-weight:600}' +
      '.bn-ok{background:#e6f7ef;color:#0a6b3d}.bn-err{background:#fdecea;color:#b71c1c}' +
      '.bn-trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
      '@media(max-width:768px){.bn-inform{padding:25px 18px}.bn-grid{grid-template-columns:1fr}.bn-field.bn-full,.bn-btn{grid-column:span 1}}';
    document.head.appendChild(style);

    var box = document.createElement('div');
    box.className = 'bn-inform';
    box.innerHTML =
      '<h3>Already Donated? Let Us Know</h3>' +
      '<p class="bn-sub">Share your details so our team can confirm your donation and thank you personally.</p>' +
      '<form data-bn-form="donation">' +
      '<div class="bn-grid">' +
      '<div class="bn-field"><label for="bnName">Your Name</label><input type="text" id="bnName" name="name" placeholder="Enter your name" required></div>' +
      '<div class="bn-field"><label for="bnPhone">Phone / WhatsApp</label><input type="tel" id="bnPhone" name="phone" placeholder="03XX XXXXXXX" required></div>' +
      '<div class="bn-field"><label for="bnAmount">Amount (PKR)</label><input type="number" id="bnAmount" name="amount" min="1" placeholder="e.g. 5000"></div>' +
      '<div class="bn-field"><label for="bnFund">Donation Type</label><select id="bnFund" name="fundType">' +
      '<option value="Atiyaat (Donations)">General Donation (Atiyaat)</option>' +
      '<option value="Zakaat">Zakaat</option><option value="Sadqa">Sadqa</option><option value="Fitrana">Fitrana</option>' +
      '<option value="Ration / Ajnaas (In-kind food &amp; goods)">Ration / Ajnaas</option></select></div>' +
      '<div class="bn-field bn-full"><label for="bnMessage">Message (optional)</label><textarea id="bnMessage" name="message" placeholder="Bank / JazzCash / EasyPaisa, transaction reference, or any note"></textarea></div>' +
      '<div class="bn-trap" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<button class="bn-btn" type="submit">Send Details</button>' +
      '</div><div class="bn-msg" role="status"></div></form>';
    container.insertBefore(box, anchor || null);

    var donation = box.querySelector('form');
    var msgBox = box.querySelector('.bn-msg');
    var showMsg = function (text, ok) {
      msgBox.textContent = text;
      msgBox.className = 'bn-msg ' + (ok ? 'bn-ok' : 'bn-err');
      msgBox.style.display = 'block';
    };

    donation.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = donation.querySelector('button[type="submit"]');
      btn.disabled = true;
      send({
        submissionType: 'donation',
        donorName: val(donation, 'name'),
        phone: val(donation, 'phone'),
        amountPkr: Number(val(donation, 'amount')) || 0,
        fundType: val(donation, 'fundType'),
        notes: val(donation, 'message'),
        website: val(donation, 'website') // hidden trap field for bots
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (res.ok) {
              donation.reset();
              showMsg('Thank you! We have received your details. Our team will confirm your payment and contact you shortly.', true);
            } else {
              showMsg(data.error || 'Sorry, we could not send your details. Please try again.', false);
            }
          });
        })
        .catch(function () {
          showMsg('Network problem. Please check your internet and try again.', false);
        })
        .then(function () { btn.disabled = false; });
    });
  }

  // ---------------------------------------------------- WhatsApp chat button --
  // A floating "Chat on WhatsApp" button on every page that loads this script.
  // The visitor's first message reaches the CRM through the WhatsApp webhook and becomes a
  // "New Inquiry" lead. The ready-made text below shows staff which page the person came from.
  if (WHATSAPP_NUMBER && !document.getElementById('bn-wa-button')) {
    var page = /donat/i.test(location.pathname) ? 'donation page'
      : /contact/i.test(location.pathname) ? 'contact page'
      : 'website';
    var waText = 'Assalam o Alaikum, I am messaging from the Bait-ul-Noor ' + page + '. ';

    var waStyle = document.createElement('style');
    waStyle.textContent =
      '#bn-wa-button{position:fixed;right:20px;bottom:20px;z-index:9999;display:flex;align-items:center;gap:8px;' +
      'background:#25D366;color:#fff;text-decoration:none;font:700 15px/1 inherit;padding:13px 18px;border-radius:50px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .15s}' +
      '#bn-wa-button:hover{transform:scale(1.05);color:#fff}' +
      '#bn-wa-button i{font-size:22px}' +
      '@media(max-width:480px){#bn-wa-button span{display:none}#bn-wa-button{padding:15px}}';
    document.head.appendChild(waStyle);

    var waLink = document.createElement('a');
    waLink.id = 'bn-wa-button';
    waLink.href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(waText);
    waLink.target = '_blank';
    waLink.rel = 'noopener noreferrer';
    waLink.setAttribute('aria-label', 'Chat with us on WhatsApp');
    waLink.innerHTML = '<i class="fab fa-whatsapp" aria-hidden="true"></i><span>Chat on WhatsApp</span>';
    document.body.appendChild(waLink);
  }
})();