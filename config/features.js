// Feature flags: modules marked false stay dormant (routes 404, nav hidden) but their code is kept.
// Override one at runtime with FEATURE_<NAME>=true|false in the environment (e.g. FEATURE_LIVESTOCK=true).
// Future modules (CSA boxes, student portal, online payments, sensors) are NOT built yet; add a flag
// here when one is implemented, and keep it false until the owner approves it.
const defaults = {
  classes: true,
  produceOrders: true,
  publicClassRegistration: true,
  publicInquiries: true,
  livestock: false,
};

const features = {};
for (const [k, v] of Object.entries(defaults)) {
  const env = process.env['FEATURE_' + k.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()];
  features[k] = env === undefined ? v : env === 'true';
}
module.exports = features;
