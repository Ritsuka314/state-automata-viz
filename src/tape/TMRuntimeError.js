function TMRuntimeError(reason, details) {
  this.name = 'TMRuntimeError';
  this.stack = (new Error()).stack;

  this.reason = reason;
  this.details = details || {};
}
TMRuntimeError.prototype = Object.create(Error.prototype);
TMRuntimeError.prototype.constructor = TMRuntimeError;

module.exports = TMRuntimeError;