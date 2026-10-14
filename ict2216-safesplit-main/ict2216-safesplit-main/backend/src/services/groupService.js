// groupService.js — re-exports the functions that expensesController needs
// from the canonical groupsService module, preserving the naming convention
// used in the expense branch without duplicating any logic.
module.exports = require('./groupsService');
