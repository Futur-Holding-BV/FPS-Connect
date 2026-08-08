// Taak #840 — bewust rode testcommit: bewijst dat de deploy-gate een push met
// rode typecheck tegenhoudt. Wordt direct hierna gereverteerd.
const bewijs: number = "dit is geen number — typecheck MOET falen";
export default bewijs;
