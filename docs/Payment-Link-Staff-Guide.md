# BoConcept Brisbane — Sending a Payment Link (Sales Staff Guide)

Use the **Payment Link** app to send a customer a secure card-payment link by text message (SMS). When they pay, you’ll get an email confirmation.

> 🔗 **App address:** `https://payments-bcb.vercel.app`
> 💡 Bookmark it as **“BoConcept Payments”** for quick access.

---

## 1. Sign in

1. Open **`https://payments-bcb.vercel.app`**.
2. Click **“Sign in with Microsoft”** and use your BoConcept Microsoft (email) account.
   *(Or use the email/password fields if you don’t have a Microsoft login.)*

> 📸 **[SCREENSHOT 1]** — The login screen showing the **“Sign in with Microsoft”** button.
> *Caption: “Sign in with your BoConcept Microsoft account.”*

---

## 2. Create the payment link

You’ll land on the **Send a Payment Link** screen. Fill in every field:

| Field | What to enter |
|---|---|
| **Customer name** | The customer’s full name (e.g. *Jane Smith*) |
| **Order #** | The order number, exactly as it appears in the system (e.g. *OS-005133*) — **required** |
| **Payment amount (AUD)** | The amount to charge (e.g. *1380.05*) |
| **Your return email** | Pick yourself from the **salesperson dropdown** (your email fills in automatically), or type your email |
| **Customer mobile** | The customer’s mobile number (e.g. *04xx xxx xxx*) |

> 📸 **[SCREENSHOT 2]** — The blank form with the fields labelled.
> *Caption: “Fill in customer name, order number, amount, your return email, and the customer’s mobile.”*

> ⚠️ **Order # must match the order in the Delivery Dashboard** for the payment to be recorded against that order. Always enter it exactly.

---

## 3. Send it

1. Check the details are correct.
2. Click **“Create & send text.”**
3. You’ll see a green **“Link created and sent ✓”** message. The link is now on its way to the customer by SMS.

> 📸 **[SCREENSHOT 3]** — The green **“Link created and sent ✓”** confirmation, including the **Copy** button.
> *Caption: “Confirmation that the SMS has been sent. You can copy the link if you need it.”*

*(If you ever need the raw link — e.g. to send another way — use the **Copy** button next to it.)*

---

## 4. What the customer receives

The customer gets a text from BoConcept Brisbane with a **secure Stripe payment link**. When they tap it, they pay by card on Stripe’s secure page.

> 📸 **[SCREENSHOT 4]** — Example of the SMS as it appears on a phone.
> *Caption: “What the customer sees — a secure payment link from BoConcept Brisbane.”*

After paying, the customer lands on a **“Payment received”** confirmation page with the order, amount, and our showroom details.

> 📸 **[SCREENSHOT 5]** — The customer “Payment received” success page.
> *Caption: “The customer’s confirmation screen after a successful payment.”*

---

## 5. Knowing when you’ve been paid

- **You’ll get a confirmation email** at your return address the moment the payment clears.
- The customer also receives a card receipt automatically.
- On the app, your link moves from **Pending** to **Paid** in the **Recent links** list at the bottom of the screen.

> 📸 **[SCREENSHOT 6]** — The **Recent links** list showing a **Paid** (and a **Pending**) entry.
> *Caption: “Track your links — Pending until paid, then Paid.”*

> 📸 **[SCREENSHOT 7]** — Example of the salesperson confirmation email.
> *Caption: “You receive this email automatically when a customer pays.”*

---

## 6. How it links to the Delivery Dashboard

- If the **Order #** you entered matches an order in the Delivery Dashboard, the payment is **automatically deducted from that order’s balance**, and the order is marked **Paid** once the balance reaches zero.
- If the order number doesn’t match a dashboard order, the payment is still processed and recorded here — it just won’t touch the dashboard.

---

## Tips & FAQ

- **Deposit, progress payment, or full payment?** You can send a link for any amount — just enter the amount you’re collecting. Part-payments reduce the order balance; they don’t need to be the full amount.
- **Customer says they didn’t get the text?** Use the **Copy** button on the confirmation and send the link to them another way, or create a new link and double-check the mobile number.
- **“No access” after signing in?** Your account hasn’t been given access yet — ask your manager to add you in the Admin area.
- **Wrong amount or details?** Don’t worry — an unpaid link can simply be ignored; create a fresh, correct one.

---

*Need help? Contact your manager or the BoConcept Brisbane admin.*
