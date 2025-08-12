// config/allocationConfig.js
module.exports = {
  preferencePoints: { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20 },
  contactedBonus: { Yes: 20, No: 0 },
  timing: {
    perProjectStep: 3,   // rank 1=+30, 2=+27, 3=+24, ...
    maxStart: 30,
  },
  // deterministic tie-breaks: score DESC, pref ASC, submitted_at ASC, student_id ASC
};
