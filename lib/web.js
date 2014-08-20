
var rdf = require('./rdf');

window.rdf = rdf;

if (typeof Event === 'function') {
  var event = new Event('rdfready');
  window.dispatchEvent(event);
}
