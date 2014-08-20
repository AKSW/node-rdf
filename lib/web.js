
(function() {
  var rdf = require('./rdf');

  if (typeof define === 'function') {

    // AMD module

    define('rdf', [], function() {
      return rdf;
    });

  } else {

    window.rdf = rdf;

    if (typeof Event === 'function') {
      window.dispatchEvent( new Event('rdfready') );
    }

  }
})();
