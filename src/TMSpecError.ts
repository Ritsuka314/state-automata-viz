'use strict';

import * as _ from 'lodash';

class TMSpecError extends Error {
  public reason;
  public details;

  constructor (reason, details) {
    super();

    this.name = 'TMSpecError';

    this.reason = reason;
    this.details = details || {};

    // https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, TMSpecError.prototype);
  }

  // generate a formatted description in HTML
  get message() {
    let header = this.reason;
    let details = this.details;

    function code(str) { return '<code>' + str + '</code>'; }

    let problemValue = details.problemValue ? ' ' + code(details.problemValue) : '';
    let validationErrors =
      '<code></code><pre style="text-align: left;">' +
          // util.inspect(es, false, null, false) +
          JSON.stringify(details.validationErrors, null, 4) +
      '</pre></code>';
    let sentences = ['<strong>' + header + problemValue + '</strong>'
      , validationErrors]
    .filter(_.identity);
    return sentences.join('</br>');
  }
}

export default TMSpecError;