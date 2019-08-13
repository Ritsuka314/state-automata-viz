// main entry point for index.html.
// important: make sure to coordinate variables and elements between the HTML and JS
'use strict';

/* eslint-env browser */
window.vizAutomaton = function (root, doc) {
  var TMDocumentController = require('./TMDocumentController');

  // load up front so going offline doesn't break anything
  // (for snippet placeholders, used by "New blank document")
  
  doc = doc || root.textContent;
  root.innerHTML = `
      <!-- Diagram -->
      <div class="form-group machine-container">
        <!-- Noscript notice -->
        <noscript>
          <div class="panel panel-default">
            <div class="panel-heading">
              <h3 class="panel-title">Tip: Enable JavaScript</h3>
            </div>
            <div class="panel-body">
              <p>The visualization couldn’t load because JavaScript is disabled.</p>
            </div>
          </div>
        </noscript>
      </div>
      <!-- Simulator controls -->
      <div class="row text-center controls-container">
        <div id="simulator-alerts-container"></div>
        <div class="col-xs-1">
          <button type="button" class="btn btn-warning btn-xs text-center tm-btn-diagram tm-reset">
            <span class="glyphicon glyphicon-fast-backward" aria-hidden="true"></span><br>
            Reset
          </button>
        </div>
        <div class="col-xs-2 col-xs-offset-4 text-center">
          <button type="button" class="btn btn-primary text-center tm-btn-diagram tm-step">
            <span class="glyphicon glyphicon-step-forward" aria-hidden="true"></span><br>
            Step
          </button>
        </div>
        <div class="col-xs-1">
          <button type="button" class="btn btn-default text-center tm-btn-diagram tm-run">
            <span class="glyphicon glyphicon-play" aria-hidden="true"></span><br>
            Run
          </button>
        </div>
      </div>
  `

  function getId(id) { return root.querySelector("."+id); }

  function addAlertPane(type, html) {
    root.insertAdjacentHTML('afterbegin',
      '<div class="alert alert-'+type+' alert-dismissible" role="alert">' +
      '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">×</span></button>' +
      html +
      '</div>');
  }


  //////////////////////////
  // Compatibility Checks //
  //////////////////////////

  (function () {
    // Warn when falling back to RAM-only storage
    // NB. This mainly covers local storage errors and Safari's Private Browsing.
    if (!require('./storage').canUseLocalStorage) {
      addAlertPane('info', '<p>Local storage is unavailable. ' +
        'Your browser could be in Private Browsing mode, or it might not support <a href="http://caniuse.com/#feat=namevalue-storage" target="_blank">local storage</a>.</p>' +
        '<strong>Any changes will be lost after leaving the webpage.</strong>');
    }

    /*
    Warn for IE 10 and under, which misbehave and lack certain features.
    Examples:
      • IE 9 and under don't support .classList.
      • IE 10's "storage event is fired even on the originating document where it occurred."
        http://caniuse.com/#feat=namevalue-storage
    */

    // Detect IE 10 and under (http://stackoverflow.com/a/16135889)
    var isIEUnder11 = new Function('/*@cc_on return @_jscript_version; @*/')() < 11;
    if (isIEUnder11) {
      addAlertPane('warning',
        '<p><strong>Your <a href="http://whatbrowser.org" target="_blank">web browser</a> is out of date</strong> and does not support some features used by this program.<br>' +
        '<em>The page may not work correctly, and data may be lost.</em></p>' +
        'Please update your browser, or use another browser such as <a href="http://www.google.com/chrome/browser/" target="_blank">Chrome</a> or <a href="http://getfirefox.com" target="_blank">Firefox</a>.');
    }
  }());

  ////////////////
  // Controller //
  ////////////////

  var controller = (function () {
    function getButton(container, type) {
      return container.querySelector('button.tm-' + type);
    }

    // button containers
    var controller = getId('controls-container');

    return new TMDocumentController({
      simulator: getId('machine-container'),
      simulatorAlerts: document.getElementById('simulator-alerts-container')
    }, {
      controller: {
        run: getButton(controller, 'run'),
        step: getButton(controller, 'step'),
        reset: getButton(controller, 'reset')
      }
    }, doc);
  }());
  
}