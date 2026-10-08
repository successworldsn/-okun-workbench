/*
 * Changing Hearts — site settings. This is the ONE file to edit before going live.
 * Everything the site needs to actually deliver messages and take payments lives here.
 */
window.CH_CONFIG = {
  // Where every form message goes. REQUIRED: forms stay switched off until this or formEndpoint is set.
  // With formEndpoint empty, forms open the visitor's email app with a ready-to-send draft to this address.
  contactEmail: "",

  // Recommended: a form service URL so messages arrive even when the visitor has no email app.
  // Formspree: create a form at formspree.io and paste its URL, e.g. "https://formspree.io/f/abcdwxyz".
  // Any endpoint that accepts a JSON POST works (Netlify Forms, Basin, Getform, your own API).
  formEndpoint: "",

  // Optional Stripe Payment Links (stripe.com > Payment Links). When set, a "Pay now" button appears
  // next to the matching package. Leave empty to show "Request" only.
  payments: {
    legacyKeepsake: "",
    legacyFilm: "",
    legacyHeirloom: "",
    sponsorMoment: "",
    sponsorSeason: "",
    sponsorFounding: ""
  },

  // Impact numbers on Home and Our Approach. Leave as null to hide a number until you have a real one.
  impact: {
    communities: null,
    moments: null,
    books: null,
    partners: null
  },

  social: {
    instagram: "",
    facebook: "",
    tiktok: "",
    youtube: "",
    linkedin: ""
  },

  // Footer design credit. Set to "" to hide.
  designCredit: "Designed by EJ Success & Faithful · SuccessFlix Design Council"
};
