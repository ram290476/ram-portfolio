/* Public site settings. No secrets belong in this file.
   bookingApi: origin of the booking Worker, with no path.
     Example, once it exists: "https://book.ram.vellamsetti.com"
   turnstileSiteKey: the Turnstile site key (public). The secret key stays in the Worker.
   Leave bookingApi empty until the Worker is deployed. The Book a call section
   then stays on "Booking opens soon." */
window.PORTFOLIO = {
  bookingApi: "",
  turnstileSiteKey: ""
};
