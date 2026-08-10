// Dynamische aanvulling op app.json.
// Injecteert de bouwdatum op het moment dat de bundle/build wordt gemaakt,
// zodat het informatiescherm altijd de echte bouwdatum van deze build toont.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    bouwdatum: new Date().toISOString(),
  },
});
