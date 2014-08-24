(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

var RDFEnvironment = require("./RDFEnvironment.js").RDFEnvironment;
var RDFNodeEquals = require('./RDFNode.js').RDFNodeEquals;
var defaults = require('./Default.js');

var rdfnil = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil';
var rdffirst = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
var rdfrest = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';
function xsdns(v){ return 'http://www.w3.org/2001/XMLSchema#'+v; }

function _(v) { return { writable:false, configurable:false, enumerable:false, value:v } }
function _getter(v) { return { configurable:false, enumerable:false, get:v } }
function prop(p,l) {
	if(p == 'a') return 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
	p = p.replace('$',':');
	if(p.indexOf(':') == -1) p = env.resolve(p,l)||p;
	return p;
};
function pad(v,l){
	return ('0000'+v).substr(-(l||2));
}

var env = exports.environment = new RDFEnvironment;
Object.defineProperty(String.prototype, 'profile', _(env));
require('./Default.js').loadDefaultPrefixMap(env);

// N-Triples encoder
function encodeString(s) {
	var out = "";
	var skip = false;
	var _g1 = 0, _g = s.length;
	while(_g1 < _g) {
		var i = _g1++;
		if(!skip) {
			var code = s.charCodeAt(i);
			if(55296 <= code && code <= 56319) {
				var low = s.charCodeAt(i + 1);
				code = (code - 55296) * 1024 + (low - 56320) + 65536;
				skip = true;
			}
			if(code > 1114111) { throw new Error("Char out of range"); }
			var hex = "00000000".concat((new Number(code)).toString(16).toUpperCase());
			if(code >= 65536) {
				out += "\\U" + hex.slice(-8)
			} else {
				if(code >= 127 || code <= 31) {
					switch(code) {
						case 9:	out += "\\t"; break;
						case 10: out += "\\n"; break;
						case 13: out += "\\r"; break;
						default: out += "\\u" + hex.slice(-4); break
					}
				} else {
					switch(code) {
						case 34: out += '\\"'; break;
						case 92: out += "\\\\"; break;
						default: out += s.charAt(i); break
					}
				}
			}
		} else {
			skip = !skip;
		}
	}
	return out;
};

// JS3/JSON-LD decoding
function graphify(o, base, parentProfile){
	if(!o.id) var o=o.ref();
	return o.graphify(parentProfile);
}
exports.graphify = graphify;

function graphifyObject(aliasmap){
	var o = this;
	var graph = env.createGraph();
	var profile = env.createProfile();
	//profile.importProfile(env);
	defaults.loadRequiredPrefixMap(profile);
	if(o.aliasmap) profile.importProfile(o.aliasmap, true);
	if(aliasmap) profile.importProfile(aliasmap, true);
	function res(term){
		// Terms with a hierarchical component are URIs
		var v;
		if((v=term.toString().indexOf(':'))!==-1 && term[v+1]==='/') return term;
		// If no hierarchial component, try to resolve a CURIE
		return profile.resolve(term.toString())||term;
	}
	function rnn(term){
		// Test if `term` is an RDFNode
		if(typeof term=='string') return env.createNamedNode(res(term));
		else return term;
	}
	var context = o['$context']||o['@context'];
	if(context){
		for(var prefix in context) profile.setPrefix(prefix, context[prefix]);
	}
	function graphify(s1,p1,o1) {
		if(p1[0]=='@' || p1[0]=='$') return;
		if(typeof(o1)=='function' || typeof(o1)=='undefined') return;
		var id = o1.id || o1['$id'] || o1['@id'];
		if(!o1.nodeType && !id && typeof(o1)!="string") ref.call(o1); // If the Object doesn't have a bnode, give it one
		id = id || o1.id;
		if(Array.isArray(o1) || o1['$list'] || o1['@list']) {
			var v = o1['$list'] || o1['@list'];
			if(v) (o1=v).list = true;
			// o1 is a Collection or a multi-valued property
			if(!o1.list) {
				// o1 is a multi-valued property
				o1.forEach( function(i) { graphify(res(s1), res(p1), i) });
			} else {
				// o1 is an rdf:Collection
				if(o1.length == 0) {
					graph.add( env.createTriple(rnn(s1), rnn(prop(p1,profile)), rdfnil ) );
				} else {
					var bnode = env.createBlankNode();
					graph.add( env.createTriple(rnn(s1), rnn(prop(p1,profile)), bnode ) );
					o1.forEach( function(i,x) {
						graphify(bnode, rdffirst, i );
						var n = env.createBlankNode();
						graph.add( env.createTriple(bnode, env.createNamedNode(rdfrest), (x==o1.length-1) ? env.createNamedNode(rdfnil) : n ) );
						bnode = n;
					});
				}
			}
		} else if(id) {
			// o1 is an Object, add triple and child triples
			graph.add( env.createTriple(rnn(s1), rnn(prop(p1,profile)), rnn(id) ) );
			graph.merge( graphifyObject.call(o1, profile) );
		} else if((typeof o1)=="string") {
			// o1 is a URI
			graph.add( env.createTriple(rnn(s1), rnn(prop(p1,profile)), rnn(o1) ) );
		} else {
			// o1 is a RDFNode (literal, NamedNode, BlankNode)
			graph.add( env.createTriple(rnn(s1), rnn(prop(p1,profile)), o1 ) );
		}
	}
	if(typeof(id)=="object") throw new Error("Not an object: "+require('util').inspect(this));
	Object.keys(o).forEach(function(p) { graphify(o.id, p, o[p]) });
	return graph;
}

var ref = exports.ref = function ref(id) {
	Object.defineProperties(this, {
		id: _( id ? (typeof id.resolve=='function'?id.resolve():id) : env.createBlankNode().toString() ),
		n3: _( function(aliasmap, padding) {
			padding = padding||'\n\t';
			var outs = [];
			var o = this;
			var profile = new Profile;
			//profile.importProfile(env);
			defaults.loadRequiredPrefixMap(profile);
			if(o.aliasmap) profile.importProfile(o.aliasmap, true);
			if(aliasmap) profile.importProfile(aliasmap, true);
			Object.keys(this).forEach(function(p) {
				if(typeof o[p] == 'function') return;
				if(p[0]=='$' || p[0]=='@' || o.list&&p=='list') return;
				if(o[p].id && o[p].id.nodeType() == 'IRI') return outs.push( prop(p,profile) + ' ' + o[p].id.n3() );
				if(!o[p].nodeType && !o[p].id) ref.call(o[p]);
				outs.push( padding + (o.list?'':prop(p, profile)+' ') + o[p].n3(profile, padding+'\t') );
			});
			if(id) return this.id.n3(undefined)+outs.join(";")+' .';
			if(this.list) return '( '+outs.join(' ')+' )';
			return '['+outs+' ]';
		}),
		toNT: _( function(a) {
			return this.graphify(a).toArray().join("\n");
		}),
		graphify: _(graphifyObject),
		using: _( function() {
			Object.defineProperty(this,'aliasmap',_(Array.prototype.slice.call(arguments)));
			return this;
		})
	});
	return this;
}

// All
var ObjectProperties = {
	equals: _(RDFNodeEquals),
	ref: _(ref),
};
exports.setObjectProperties = function setObjectProperties(o){
	Object.defineProperties(o, ObjectProperties);
}

// String
var StringProperties = {
	tl: _( function(t) {
		return env.createLiteral(this.toString(), null, t);
	}),
	l: _( function(l) {
		return env.createLiteral(this.toString(), l, null);
	}),
	resolve: _( function() {
		if(this.indexOf(':')<0 || this.indexOf("//")>=0 ) return this.toString();
		return env.resolve(this)||this.toString();
	}),
	value: _getter(function(){return this.toString();}),
	nodeType: _( function() {
		//if(this.type) return 'TypedLiteral';
		//if(this.language || this.indexOf(' ') >= 0 || this.indexOf(':') == -1 ) return 'PlainLiteral';
		if(this.substr(0,2) == '_:') return 'BlankNode';
		return 'IRI';
	}),
	n3: _( function() {
		// FIXME we don't actually use the 'PlainLiteral' or 'TypedLiteral' productions. Either remove them, or re-add detection of them to String#nodeType()
		switch(this.nodeType()) {
			case 'PlainLiteral': return ('"'+encodeString(this)+'"'+(this.language?'@'+this.language:'')).toString();
			case 'IRI':
				var resolved = this.resolve();
				return (resolved == this) ? "<"+encodeString(resolved)+">" : this.toString();
			case 'BlankNode': return this.toString();
			case 'TypedLiteral':
				if(this.type.resolve() == env.resolve("rdf:PlainLiteral")) return '"'+encodeString(this)+'"';
				return '"'+encodeString(this)+'"^^<'+this.datatype+'>';
		}
	}),
	toNT: _( function() {
		switch(this.nodeType()) {
			case 'PlainLiteral': return ('"' + encodeString(this) + '"' + ( this.language ? '@' + this.language : '')).toString();
			case 'IRI': return "<" + encodeString(this.resolve()) + ">";
			case 'BlankNode': return this.toString();
			case 'TypedLiteral':
				if(this.type.resolve() == env.resolve("rdf:PlainLiteral")) return '"' + encodeString(this) + '"';
				return '"' + encodeString(this) + '"^^<' + this.datatype + '>';
		}
	}),
	toCanonical: _( function() { return this.n3() } )
};
exports.setStringProperties = function setStringProperties(o){
	Object.defineProperties(o, StringProperties);
}

// Array
var ArrayProperties = {
	toList: _(function() {
		this.list = true;
		return this;
	}),
	n3: _( function(a, padding) {
		padding = padding||'\n\t';
		var outs = [];
		this.forEach( function(i) {
			if(typeof i == 'function') return;
			if(i.id && i.id.nodeType() == 'IRI') return outs.push( i.id.n3() );
			if(!i.nodeType) ref.call(i);
			outs.push(i.n3(a, padding+'\t'))
		});
		return this.list ? "("+padding+outs.join(padding)+" )" : outs.join(", ");
	})
};

exports.setArrayProperties = function setArrayProperties(o){
	Object.defineProperties(o, ArrayProperties);
}

// Boolean
var BooleanProperties = {
	datatype: _( xsdns("boolean") ),
	value: _getter(function(){return this;}),
	nodeType: _( function() { return "TypedLiteral"} ),
	n3: _( function() { return this.valueOf() } ),
	toNT: _( function() { return '"' + this.valueOf() + '"' + "^^<" + this.datatype + '>' } ),
	toCanonical: _( function() { return this.toNT() } )
};
exports.setBooleanProperties = function setBooleanProperties(o){
	Object.defineProperties(o, BooleanProperties);
}

// Date
var DateProperties = {
	datatype: _( xsdns("dateTime") ),
	value: _getter(function(){return this;}),
	nodeType: _( function() { return "TypedLiteral"} ),
	n3: _( function() {
		if(!this.getTime()) return '"NaN"^^<' + xsdns('double') + '>';
		return '"' + this.getUTCFullYear()+'-' + pad(this.getUTCMonth()+1)+'-' + pad(this.getUTCDate())+'T'
		+ pad(this.getUTCHours())+':' + pad(this.getUTCMinutes())+':' + pad(this.getUTCSeconds())+'Z"^^<' + this.datatype + '>';
	}),
	toNT: _( function() { return this.n3() } ),
	toCanonical: _( function() { return this.n3() } )
}
exports.setDateProperties = function setDateProperties(o){
	Object.defineProperties(o, DateProperties);
}

// Number
var INTEGER = new RegExp("^(-|\\+)?[0-9]+$", "");
var DOUBLE = new RegExp("^(-|\\+)?(([0-9]+\\.[0-9]*[eE]{1}(-|\\+)?[0-9]+)|(\\.[0-9]+[eE]{1}(-|\\+)?[0-9]+)|([0-9]+[eE]{1}(-|\\+)?[0-9]+))$", "");
var DECIMAL = new RegExp("^(-|\\+)?[0-9]*\\.[0-9]+?$", "");
var NumberProperties = {
	datatype: {
		configurable : false, enumerable: false,
		get: function() {
			if(this == Number.POSITIVE_INFINITY) return xsdns('double');
			if(this == Number.NEGATIVE_INFINITY) return xsdns('double');
			if(isNaN(this)) return xsdns('double');
			var n = this.toString();
			if(INTEGER.test(n)) return xsdns('integer');
			if(DECIMAL.test(n)) return xsdns('decimal');
			if(DOUBLE.test(n)) return xsdns('double');
		}
	},
	value: 	 _getter(function(){return this;}),
	nodeType: _( function() { return "TypedLiteral" } ),
	n3: _( function() {
		if(this == Number.POSITIVE_INFINITY) return '"INF"^^<' + xsdns('double') + '>';
		if(this == Number.NEGATIVE_INFINITY) return '"-INF"^^<' + xsdns('double') + '>';
		if(isNaN(this)) return '"NaN"^^<' + 'xsd:double'.resolve() + '>';
		return this.toString();
	}),
	toNT: _( function() {
		if(this == Number.POSITIVE_INFINITY) return '"INF"^^<' + xsdns('double') + '>';
		if(this == Number.NEGATIVE_INFINITY) return '"-INF"^^<' + xsdns('double') + '>';
		if(isNaN(this)) return '"NaN"^^<' + xsdns('double') + '>';
		return '"' + this.toString() + '"' + "^^<" + this.datatype + '>';
	}),
	toCanonical: _( function() { return this.nt() } ),
	toTL: _( function() { return this.nt() } )
}
exports.setNumberProperties = function setNumberProperties(o){
	Object.defineProperties(o, NumberProperties);
}

exports.toStruct = function toStruct(o){
	var r;
	if(typeof o=='string'||o instanceof String){
		r = new String(o);
		api.setStringProperties(r);
	}else if(o instanceof Array){
		r = new Array(o);
		api.setArrayProperties(r);
	}else if(typeof o=='boolean'||o instanceof Boolean){
		r = new Boolean(o);
		api.setBooleanProperties(r);
	}else if(o instanceof Date){
		r = new Date(o);
		api.setNumberProperties(r);
	}else if(typeof o=='number'||o instanceof Number){
		r = new Number(o);
		api.setNumberProperties(r);
	}else{
		r = new Object(o);
	}
	api.setObjectProperties(r);
	return r;
}

// Sometimes the standard API context isn't global, and an Object in one context isn't an Object in another.
// For these cases, you'll need to call these functions by hand.
exports.setBuiltins = function setBuiltins(){
	exports.setObjectProperties(Object.prototype);
	exports.setStringProperties(String.prototype);
	exports.setArrayProperties(Array.prototype);
	exports.setBooleanProperties(Boolean.prototype);
	exports.setDateProperties(Date.prototype);
	exports.setNumberProperties(Number.prototype);
}

},{"./Default.js":2,"./RDFEnvironment.js":5,"./RDFNode.js":6,"util":13}],2:[function(require,module,exports){
function xsdns(v){ return 'http://www.w3.org/2001/XMLSchema#'.concat(v) }
exports.loadDefaultTypeConverters = function(context){
	var stringConverter = function(value, inputType) { return new String(value).valueOf() };
	context.registerTypeConversion(xsdns("string"), stringConverter);
	var booleanConverter = function(value, inputType) { switch(value){case "false":case "0":return false;} return(new Boolean(value)).valueOf() };
	context.registerTypeConversion(xsdns("boolean"), booleanConverter);
	var numberConverter = function(value, inputType) { return(new Number(value)).valueOf() };
	var floatConverter = function(value, inputType) {
		switch(value){
			case "INF": return Number.POSITIVE_INFINITY;
			case "-INF": return Number.NEGATIVE_INFINITY;
			default: return numberConverter(value, inputType);
		};
	};
	context.registerTypeConversion(xsdns("float"), floatConverter);
	context.registerTypeConversion(xsdns("integer"), numberConverter);
	context.registerTypeConversion(xsdns("long"), numberConverter);
	context.registerTypeConversion(xsdns("double"), numberConverter);
	context.registerTypeConversion(xsdns("decimal"), numberConverter);
	context.registerTypeConversion(xsdns("nonPositiveInteger"), numberConverter);
	context.registerTypeConversion(xsdns("nonNegativeInteger"), numberConverter);
	context.registerTypeConversion(xsdns("negativeInteger"), numberConverter);
	context.registerTypeConversion(xsdns("int"), numberConverter);
	context.registerTypeConversion(xsdns("unsignedLong"), numberConverter);
	context.registerTypeConversion(xsdns("positiveInteger"), numberConverter);
	context.registerTypeConversion(xsdns("short"), numberConverter);
	context.registerTypeConversion(xsdns("unsignedInt"), numberConverter);
	context.registerTypeConversion(xsdns("byte"), numberConverter);
	context.registerTypeConversion(xsdns("unsignedShort"), numberConverter);
	context.registerTypeConversion(xsdns("unsignedByte"), numberConverter);
	var dateConverter = function(value, inputType) { return new Date(value) };
	context.registerTypeConversion(xsdns("date"), dateConverter);
	context.registerTypeConversion(xsdns("time"), dateConverter);
	context.registerTypeConversion(xsdns("dateTime"), dateConverter);
};
exports.loadRequiredPrefixMap = function(context){
	context.setPrefix("owl", "http://www.w3.org/2002/07/owl#");
	context.setPrefix("rdf", "http://www.w3.org/1999/02/22-rdf-syntax-ns#");
	context.setPrefix("rdfs", "http://www.w3.org/2000/01/rdf-schema#");
	context.setPrefix("rdfa", "http://www.w3.org/ns/rdfa#");
	context.setPrefix("xhv", "http://www.w3.org/1999/xhtml/vocab#");
	context.setPrefix("xml", "http://www.w3.org/XML/1998/namespace");
	context.setPrefix("xsd", "http://www.w3.org/2001/XMLSchema#");
};
exports.loadDefaultPrefixMap = function(context){
	exports.loadRequiredPrefixMap(context);
	context.setPrefix("grddl", "http://www.w3.org/2003/g/data-view#");
	context.setPrefix("powder", "http://www.w3.org/2007/05/powder#");
	context.setPrefix("powders", "http://www.w3.org/2007/05/powder-s#");
	context.setPrefix("rif", "http://www.w3.org/2007/rif#");
	context.setPrefix("atom", "http://www.w3.org/2005/Atom/");
	context.setPrefix("xhtml", "http://www.w3.org/1999/xhtml#");
	context.setPrefix("formats", "http://www.w3.org/ns/formats/");
	context.setPrefix("xforms", "http://www.w3.org/2002/xforms/");
	context.setPrefix("xhtmlvocab", "http://www.w3.org/1999/xhtml/vocab/");
	context.setPrefix("xpathfn", "http://www.w3.org/2005/xpath-functions#");
	context.setPrefix("http", "http://www.w3.org/2006/http#");
	context.setPrefix("link", "http://www.w3.org/2006/link#");
	context.setPrefix("time", "http://www.w3.org/2006/time#");
	context.setPrefix("acl", "http://www.w3.org/ns/auth/acl#");
	context.setPrefix("cert", "http://www.w3.org/ns/auth/cert#");
	context.setPrefix("rsa", "http://www.w3.org/ns/auth/rsa#");
	context.setPrefix("crypto", "http://www.w3.org/2000/10/swap/crypto#");
	context.setPrefix("list", "http://www.w3.org/2000/10/swap/list#");
	context.setPrefix("log", "http://www.w3.org/2000/10/swap/log#");
	context.setPrefix("math", "http://www.w3.org/2000/10/swap/math#");
	context.setPrefix("os", "http://www.w3.org/2000/10/swap/os#");
	context.setPrefix("string", "http://www.w3.org/2000/10/swap/string#");
	context.setPrefix("doc", "http://www.w3.org/2000/10/swap/pim/doc#");
	context.setPrefix("contact", "http://www.w3.org/2000/10/swap/pim/contact#");
	context.setPrefix("p3p", "http://www.w3.org/2002/01/p3prdfv1#");
	context.setPrefix("swrl", "http://www.w3.org/2003/11/swrl#");
	context.setPrefix("swrlb", "http://www.w3.org/2003/11/swrlb#");
	context.setPrefix("exif", "http://www.w3.org/2003/12/exif/ns#");
	context.setPrefix("earl", "http://www.w3.org/ns/earl#");
	context.setPrefix("ma", "http://www.w3.org/ns/ma-ont#");
	context.setPrefix("sawsdl", "http://www.w3.org/ns/sawsdl#");
	context.setPrefix("sd", "http://www.w3.org/ns/sparql-service-description#");
	context.setPrefix("skos", "http://www.w3.org/2004/02/skos/core#");
	context.setPrefix("fresnel", "http://www.w3.org/2004/09/fresnel#");
	context.setPrefix("gen", "http://www.w3.org/2006/gen/ont#");
	context.setPrefix("timezone", "http://www.w3.org/2006/timezone#");
	context.setPrefix("skosxl", "http://www.w3.org/2008/05/skos-xl#");
	context.setPrefix("org", "http://www.w3.org/ns/org#");
	context.setPrefix("ical", "http://www.w3.org/2002/12/cal/ical#");
	context.setPrefix("wgs84", "http://www.w3.org/2003/01/geo/wgs84_pos#");
	context.setPrefix("vcard", "http://www.w3.org/2006/vcard/ns#");
	context.setPrefix("turtle", "http://www.w3.org/2008/turtle#");
	context.setPrefix("pointers", "http://www.w3.org/2009/pointers#");
	context.setPrefix("dcat", "http://www.w3.org/ns/dcat#");
	context.setPrefix("imreg", "http://www.w3.org/2004/02/image-regions#");
	context.setPrefix("rdfg", "http://www.w3.org/2004/03/trix/rdfg-1/");
	context.setPrefix("swp", "http://www.w3.org/2004/03/trix/swp-2/");
	context.setPrefix("rei", "http://www.w3.org/2004/06/rei#");
	context.setPrefix("wairole", "http://www.w3.org/2005/01/wai-rdf/GUIRoleTaxonomy#");
	context.setPrefix("states", "http://www.w3.org/2005/07/aaa#");
	context.setPrefix("wn20schema", "http://www.w3.org/2006/03/wn/wn20/schema/");
	context.setPrefix("httph", "http://www.w3.org/2007/ont/httph#");
	context.setPrefix("act", "http://www.w3.org/2007/rif-builtin-action#");
	context.setPrefix("common", "http://www.w3.org/2007/uwa/context/common.owl#");
	context.setPrefix("dcn", "http://www.w3.org/2007/uwa/context/deliverycontext.owl#");
	context.setPrefix("hard", "http://www.w3.org/2007/uwa/context/hardware.owl#");
	context.setPrefix("java", "http://www.w3.org/2007/uwa/context/java.owl#");
	context.setPrefix("loc", "http://www.w3.org/2007/uwa/context/location.owl#");
	context.setPrefix("net", "http://www.w3.org/2007/uwa/context/network.owl#");
	context.setPrefix("push", "http://www.w3.org/2007/uwa/context/push.owl#");
	context.setPrefix("soft", "http://www.w3.org/2007/uwa/context/software.owl#");
	context.setPrefix("web", "http://www.w3.org/2007/uwa/context/web.owl#");
	context.setPrefix("content", "http://www.w3.org/2008/content#");
	context.setPrefix("vs", "http://www.w3.org/2003/06/sw-vocab-status/ns#");
	context.setPrefix("air", "http://dig.csail.mit.edu/TAMI/2007/amord/air#");
	context.setPrefix("ex", "http://example.org/");
	context.setPrefix("dc", "http://purl.org/dc/terms/");
	context.setPrefix("dc11", "http://purl.org/dc/elements/1.1/");
	context.setPrefix("dctype", "http://purl.org/dc/dcmitype/");
	context.setPrefix("foaf", "http://xmlns.com/foaf/0.1/");
	context.setPrefix("cc", "http://creativecommons.org/ns#");
	context.setPrefix("opensearch", "http://a9.com/-/spec/opensearch/1.1/");
	context.setPrefix("void", "http://rdfs.org/ns/void#");
	context.setPrefix("sioc", "http://rdfs.org/sioc/ns#");
	context.setPrefix("sioca", "http://rdfs.org/sioc/actions#");
	context.setPrefix("sioct", "http://rdfs.org/sioc/types#");
	context.setPrefix("lgd", "http://linkedgeodata.org/vocabulary#");
	context.setPrefix("moat", "http://moat-project.org/ns#");
	context.setPrefix("days", "http://ontologi.es/days#");
	context.setPrefix("giving", "http://ontologi.es/giving#");
	context.setPrefix("lang", "http://ontologi.es/lang/core#");
	context.setPrefix("like", "http://ontologi.es/like#");
	context.setPrefix("status", "http://ontologi.es/status#");
	context.setPrefix("og", "http://opengraphprotocol.org/schema/");
	context.setPrefix("protege", "http://protege.stanford.edu/system#");
	context.setPrefix("dady", "http://purl.org/NET/dady#");
	context.setPrefix("uri", "http://purl.org/NET/uri#");
	context.setPrefix("audio", "http://purl.org/media/audio#");
	context.setPrefix("video", "http://purl.org/media/video#");
	context.setPrefix("gridworks", "http://purl.org/net/opmv/types/gridworks#");
	context.setPrefix("hcterms", "http://purl.org/uF/hCard/terms/");
	context.setPrefix("bio", "http://purl.org/vocab/bio/0.1/");
	context.setPrefix("cs", "http://purl.org/vocab/changeset/schema#");
	context.setPrefix("geographis", "http://telegraphis.net/ontology/geography/geography#");
	context.setPrefix("doap", "http://usefulinc.com/ns/doap#");
	context.setPrefix("daml", "http://www.daml.org/2001/03/daml+oil#");
	context.setPrefix("geonames", "http://www.geonames.org/ontology#");
	context.setPrefix("sesame", "http://www.openrdf.org/schema/sesame#");
	context.setPrefix("cv", "http://rdfs.org/resume-rdf/");
	context.setPrefix("wot", "http://xmlns.com/wot/0.1/");
	context.setPrefix("media", "http://purl.org/microformat/hmedia/");
	context.setPrefix("ctag", "http://commontag.org/ns#");
};

},{}],3:[function(require,module,exports){
/**
 * The very fastest graph for heavy read operations, but uses three indexes
 * TripletGraph (fast, triple indexed) implements DataStore

[NoInterfaceObject]
interface Graph {
    readonly attribute unsigned long          length;
    Graph            add (in Triple triple);
    Graph            remove (in Triple triple);
    Graph            removeMatches (in any? subject, in any? predicate, in any? object);
    sequence<Triple> toArray ();
    boolean          some (in TripleFilter callback);
    boolean          every (in TripleFilter callback);
    Graph            filter (in TripleFilter filter);
    void             forEach (in TripleCallback callback);
    Graph            match (in any? subject, in any? predicate, in any? object, in optional unsigned long limit);
    Graph            merge (in Graph graph);
    Graph            addAll (in Graph graph);
    readonly attribute sequence<TripleAction> actions;
    Graph            addAction (in TripleAction action, in optional boolean run);
};

*/
var api = exports;

/**
 * Read an RDF Collection and return it as an Array
 */
var rdfnil = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil';
var rdffirst = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
var rdfrest = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';

function insertIndex(i, a, b, c, t){
	if(!i[a]) i[a] = {};
	if(!i[a][b]) i[a][b] = {};
	i[a][b][c] = t;
}

function deleteIndex(i, a, b, c){
	if(i[a]&&i[a][b]&&i[a][b][c]){
		delete(i[a][b][c]);
		if(!Object.keys(i[a][b]).length) delete(i[a][b]);
		if(!Object.keys(i[a]).length) delete(i[a]);
	}
}

api.Graph = api.TripletGraph = function TripletGraph(init){
	this.clear();
	Object.defineProperty(this, 'size', {get: function(){return self.length;}});
	var self = this;
	if(init && init.forEach){
		init.forEach(function(t){ self.add(t); });
	}
}
api.TripletGraph.prototype.length = null;
api.TripletGraph.prototype.graph = null;

api.TripletGraph.prototype.importArray = function(a) { while( a.length > 0) { this.add(a.pop()) } };

api.TripletGraph.prototype.insertIndex = insertIndex;
api.TripletGraph.prototype.deleteIndex = deleteIndex;
api.TripletGraph.prototype.add = function(triple) {
	insertIndex(this.indexOPS, triple.object, triple.predicate, triple.subject, triple);
	insertIndex(this.indexPSO, triple.predicate, triple.subject, triple.object, triple);
	insertIndex(this.indexSOP, triple.subject, triple.object, triple.predicate, triple);
	this.length++;
};
api.TripletGraph.prototype.addAll = function(g){
	var g2 = this;
	g.forEach(function(s){ g2.add(s); });
};
api.TripletGraph.prototype.merge = function(g){
	var gx = new api.TripletGraph;
	gx.addAll(this);
	gx.addAll(g);
	return gx;
};
api.TripletGraph.prototype.remove = function(triple) {
	deleteIndex(this.indexOPS, triple.object, triple.predicate, triple.subject);
	deleteIndex(this.indexPSO, triple.predicate, triple.subject, triple.object);
	deleteIndex(this.indexSOP, triple.subject, triple.object, triple.predicate);
	this.length--;
}
api.TripletGraph.prototype.removeMatches = function(triple) {
	// TODO
}
api.TripletGraph.prototype.clear = function(){
	this.indexSOP = {};
	this.indexPSO = {};
	this.indexOPS = {};
	this.length = 0;
}
api.TripletGraph.prototype.import = function(s) {
	var _g1 = 0, _g = s.length;
	while(_g1 < _g) {
		var i = _g1++;
		this.add(s.get(i))
	}
};
api.TripletGraph.prototype.every = function(filter) { return this.toArray().every(filter) };
api.TripletGraph.prototype.some = function(filter) { return this.toArray().some(filter) };
api.TripletGraph.prototype.forEach = function(callbck) { this.toArray().forEach(callbck) };
api.TripletGraph.prototype.apply = function(filter) { this.graph = this.toArray().filter(filter); this.length = this.graph.length; };
api.TripletGraph.prototype.toArray = function() { return this.match(); };
api.TripletGraph.prototype.filter = function(cb){ return this.toArray().filter(cb) };
api.TripletGraph.prototype.getCollection = function getCollection(subject){
	var collection=[], seen=[];
	var first, rest=subject;
	while(rest && rest!=rdfnil){
		first = this.match(rest, rdffirst).map(function(v){return v.object})[0];
		if(first===undefined) throw new Error('Collection <'+rest+'> is incomplete');
		if(seen.indexOf(rest)!==-1) throw new Error('Collection <'+rest+'> is circular');
		seen.push(rest);
		collection.push(first);
		rest = this.match(rest, rdfrest).map(function(v){return v.object})[0];
	}
	return collection;
};
// FIXME this should return a Graph, not an Array
// FIXME ensure that the RDFNode#equals semantics are met
api.TripletGraph.prototype.match = function(subject, predicate, object){
	var triples = [];
	var pattern = {s:subject,p:predicate,o:object};
	var patternIndexMap =
			[ {index:this.indexOPS, constants:["o", "p", "s"], variables:[]}
			, {index:this.indexPSO, constants:["p", "s"], variables:["o"]}
			, {index:this.indexSOP, constants:["s", "o"], variables:["p"]}
			, {index:this.indexSOP, constants:["s"], variables:["o", "p"]}
			, {index:this.indexOPS, constants:["o", "p"], variables:["s"]}
			, {index:this.indexPSO, constants:["p"], variables:["s", "o"]}
			, {index:this.indexOPS, constants:["o"], variables:["p", "s"]}
			, {index:this.indexPSO, constants:[], variables:["p", "s", "o"]}
			];
	var patternType = 0;
	if(!pattern.s) patternType |= 4;
	if(!pattern.p) patternType |= 2;
	if(!pattern.o) patternType |= 1;
	var index = patternIndexMap[patternType];
	var data = index.index;
	index.constants.forEach(function(v){if(data) data=data[pattern[v]];});
	if(!data) return [];
	(function go(data, c){
		if(c) Object.keys(data).forEach(function(t){go(data[t], c-1);});
		else triples.push(data);
	})(data, index.variables.length);
	return triples;
};

},{}],4:[function(require,module,exports){
/** Implements interfaces from http://www.w3.org/TR/2011/WD-rdf-interfaces-20110510/ */

var api = exports;

var NamedNode = require("./RDFNode.js").NamedNode;

api.SCHEME_MATCH = new RegExp("^[a-z0-9-.+]+:", "i");


/**
 * Implements PrefixMap http://www.w3.org/TR/2011/WD-rdf-interfaces-20110510/#idl-def-PrefixMap
 */
api.PrefixMap = function PrefixMap(){
	
}
api.PrefixMap.prototype.get = function(prefix){
	// strip a trailing ":"
	if(prefix.slice(-1)==":") prefix=prefix.slice(0, -1);
	if(Object.hasOwnProperty.call(this, prefix)) return this[prefix];
}
api.PrefixMap.prototype.set = function(prefix, uri){
	// strip a trailing ":"
	if(prefix.slice(-1)==":") prefix=prefix.slice(0, -1);
	this[prefix] = uri;
}
api.PrefixMap.prototype.remove = function(toResolve){
	if(Object.hasOwnProperty.call(this, prefix)) delete this[prefix];
}
api.PrefixMap.prototype.resolve = function(curie){
	var index = curie.indexOf(":");
	if(index<0) return null;
	var prefix = curie.slice(0, index);
	var iri = this[prefix];
	if(!iri) return null;
	var resolved = iri.concat(curie.slice(++index));
	if(resolved.match(api.SCHEME_MATCH)==null && this.base!=null){ resolved = this.base.resolveReference(resolved) }
	return resolved.toString();
}
api.PrefixMap.prototype.shrink = function(uri) {
	for(prefix in this)
		if(Object.hasOwnProperty.call(this, prefix) && uri.substr(0,this[prefix].length)==this[prefix])
			return prefix + ':' + uri.slice(this[prefix].length);
	return uri;
}
api.PrefixMap.prototype.setDefault = function(uri){
	this.set('', uri);
}
api.PrefixMap.prototype.addAll = function(prefixes, override){
	if(override) for(var n in prefixes) this.set(n, prefixes[n]);
	else for(var n in prefixes) if(!Object.hasOwnProperty.call(this, n)) this.set(n, prefixes[n]);
}

/**
 * Implements TermMap http://www.w3.org/TR/2011/WD-rdf-interfaces-20110510/#idl-def-TermMap
 */
api.TermMap = function TermMap(){

}
api.TermMap.prototype.get = function(term){
	if(Object.hasOwnProperty.call(this, term)) return this[term];
}
api.TermMap.prototype.set = function(term, uri){
	this[term] = uri;
}
api.TermMap.prototype.remove = function(term){
	if(Object.hasOwnProperty.call(this, prefix)) delete this[prefix];
}
api.TermMap.prototype.resolve = function(term){
	if(Object.hasOwnProperty.call(this, term)) return this[term];
	return null;
}
api.TermMap.prototype.shrink = function(uri){
	for(term in this)
		if(Object.hasOwnProperty.call(this, term) && uri==this[term])
			return term;
	return uri;
}
api.TermMap.prototype.setDefault = function(uri){
	this.set('', uri);
}
api.TermMap.prototype.addAll = function(terms, override){
	if(override) for(var n in terms) this.set(n, terms[n]);
	else for(var n in terms) if(!Object.hasOwnProperty.call(this, n)) this.set(n, terms[n]);
}


/**
 * Implements Profile http://www.w3.org/TR/2011/WD-rdf-interfaces-20110510/#idl-def-Profile
 */
api.Profile = function Profile() {
	this.prefixes = new api.PrefixMap;
	this.terms = new api.TermMap;
};
api.Profile.prototype.resolve = function(toresolve){
	if(toresolve.indexOf(":")<0) return this.terms.resolve(toresolve);
	else return this.prefixes.resolve(toresolve);
}
api.Profile.prototype.setDefaultVocabulary = function(uri){
	this.terms.setDefault(uri);
}
api.Profile.prototype.setDefaultPrefix = function(uri){
	this.prefixes.setDefault(uri);
}
api.Profile.prototype.setTerm = function(term, uri){
	this.terms.set(term, uri);
}
api.Profile.prototype.setPrefix = function(prefix, uri){
	this.prefixes.set(prefix, uri);
}
api.Profile.prototype.shrink = function(uri){
	return this.terms.shrink(this.prefixes.shrink(uri));
}
api.Profile.prototype.importProfile = function(profile, override){
	this.prefixes.addAll(profile.prefixes, override);
	this.terms.addAll(profile.terms, override);
}

// A possibly useful function for the future?
api.Profile.prototype._resolveType = function(type) {
	if(type.slice(0, 2) == "^^") { type = type.slice(2) }
	return this.resolve(type) || type;
}

},{"./RDFNode.js":6}],5:[function(require,module,exports){

var NamedNode = require("./RDFNode.js").NamedNode;
var BlankNode = require("./RDFNode.js").BlankNode;
var Literal = require("./RDFNode.js").Literal;
var Triple = require("./RDFNode.js").Triple;
var Graph = require("./Graph.js").Graph;
var Profile = require("./Profile.js").Profile;
var PrefixMap = require("./Profile.js").PrefixMap;
var TermMap = require("./Profile.js").TermMap;
var loadRequiredPrefixMap = require("./Default.js").loadRequiredPrefixMap;

/**
 * Implements RDFEnvironment http://www.w3.org/TR/2011/WD-rdf-interfaces-20110510/#idl-def-RDFEnvironment
 */
exports.RDFEnvironment = function RDFEnvironment(){
	Profile.call(this);
	loadRequiredPrefixMap(this);
}
exports.RDFEnvironment.prototype = Object.create(Profile.prototype, {constructor:{value:exports.RDFEnvironment, iterable:false}});
exports.RDFEnvironment.prototype.createBlankNode = function(){
	return new BlankNode;
}
exports.RDFEnvironment.prototype.createNamedNode = function(v){
	return new NamedNode(v);
}
exports.RDFEnvironment.prototype.createLiteral = function(value, language, datatype){
	var literal = new Literal(value);
	literal.language = language;
	literal.datatype = datatype;
	return literal;
}
exports.RDFEnvironment.prototype.createTriple = function(s,p,o){
	return new Triple(s,p,o);
}
exports.RDFEnvironment.prototype.createGraph = function(g){
	return new Graph(g);
}
//exports.RDFEnvironment.prototype.createAction = function(){
//	return new Action;
//}
exports.RDFEnvironment.prototype.createProfile = function(){
	return new Profile;
}
exports.RDFEnvironment.prototype.createTermMap = function(){
	return new TermMap;
}
exports.RDFEnvironment.prototype.createPrefixMap = function(){
	return new PrefixMap;
}

},{"./Default.js":2,"./Graph.js":3,"./Profile.js":4,"./RDFNode.js":6}],6:[function(require,module,exports){
var api = exports;

function nodeType(v){
	if(v.nodeType) return v.nodeType();
	if(typeof v=='string') return (v.substr(0,2)=='_:')?'BlankNode':'IRI';
	return 'TypedLiteral';
}
api.nodeType = nodeType;

function RDFNodeEquals(other) {
	if(nodeType(this)!=nodeType(other)) return false;
	switch(nodeType(this)) {
		case "IRI":
		case "BlankNode":
			return this.toString()==other.toString();
		case "PlainLiteral":
			return this.language==other.language && this.nominalValue==other.nominalValue;
		case "TypedLiteral":
			return this.type==other.type && this.nominalValue==other.nominalValue;
	}
	return this.toNT() == other.toNT();
}
api.RDFNodeEquals = RDFNodeEquals;

/**
* Implements Triple http://www.w3.org/TR/2011/WD-rdf-interfaces-20110510/#idl-def-Triple
*/
api.Triple = function Triple(s, p, o) {
	this.subject = s;
	this.predicate = p;
	this.object = o;
};
api.Triple.prototype.size = 3;
api.Triple.prototype.length = 3;
api.Triple.prototype.toString = function() { return this.subject.toNT() + " " + this.predicate.toNT() + " " + this.object.toNT() + " ." }
api.Triple.prototype.equals = function(t) { return RDFNodeEquals.call(this.subject,t.subject) && RDFNodeEquals.call(this.predicate,t.predicate) && RDFNodeEquals.call(this.object,t.object) }

/**
 * Implements RDFNode http://www.w3.org/TR/2011/WD-rdf-interfaces-20110510/#idl-def-RDFNode
 */
api.RDFNode = function RDFNode() {};
api.RDFNode.prototype.equals = api.RDFNodeEquals = RDFNodeEquals;
api.RDFNode.prototype.nodeType = function() { return "RDFNode"; }
api.RDFNode.prototype.toNT = function() { return ""; }
api.RDFNode.prototype.toCanonical = function() { return this.toNT(); }
api.RDFNode.prototype.toString = function() { return this.nominalValue; }
api.RDFNode.prototype.valueOf = function() { return this.nominalValue; }
api.encodeString = function(s) {
	var out = "";
	var skip = false;
	var _g1 = 0, _g = s.length;
	while(_g1 < _g) {
		var i = _g1++;
		if(!skip) {
			var code = s.charCodeAt(i);
			if(55296 <= code && code <= 56319) {
				var low = s.charCodeAt(i + 1);
				code = (code - 55296) * 1024 + (low - 56320) + 65536;
				skip = true;
			}
			if(code > 1114111) { throw new Error("Char out of range"); }
			var hex = "00000000".concat((new Number(code)).toString(16).toUpperCase());
			if(code >= 65536) {
				out += "\\U" + hex.slice(-8);
			} else {
				if(code >= 127 || code <= 31) {
					switch(code) {
						case 9:	out += "\\t"; break;
						case 10: out += "\\n"; break;
						case 13: out += "\\r"; break;
						default: out += "\\u" + hex.slice(-4); break;
					}
				} else {
					switch(code) {
						case 34: out += '\\"'; break;
						case 92: out += "\\\\"; break;
						default: out += s.charAt(i); break;
					}
				}
			}
		} else {
			skip = !skip;
		}
	}
	return out;
}

/**
 * BlankNode
 */
api.BlankNode = function BlankNode(id) {
	if(typeof id=='string' && id.substr(0,2)=='_:') this.nominalValue=id.substr(2);
	else if(id) this.nominalValue=id;
	else this.nominalValue = 'b'+(++api.BlankNode.NextId).toString();
}
api.BlankNode.NextId = 0;
// Or maybe: Object.create(api.RDFNode.prototype, {constructor: {value: api.NamedNode, enumerable:false}});
api.BlankNode.prototype = new api.RDFNode;
api.BlankNode.prototype.nodeType = function() { return "BlankNode"; }
api.BlankNode.prototype.toNT = function() { return "_:"+this.nominalValue; }
api.BlankNode.prototype.n3 = function() { return this.toNT(); }
api.BlankNode.prototype.toString =  function() { return "_:"+this.nominalValue; }

/**
 * Implements Literal http://www.w3.org/TR/2011/WD-rdf-interfaces-20110510/#idl-def-Literal
 */
api.Literal = function Literal(value, language) {
	this.nominalValue = value;
	if(typeof language=="string" && language[0]=="@") this.language = language.slice(1);
	else if(typeof language=="string") this.datatype = language;
};
api.Literal.prototype = new api.RDFNode;
api.Literal.prototype.nodeType = function() {
	if(this.datatype) return "TypedLiteral";
	return "PlainLiteral";
}
api.Literal.prototype.toNT = function() {
	var string = '"'+api.encodeString(this.nominalValue)+'"';
	if(this.datatype) return string+'^^<'+this.datatype+">";
	if(this.language) return string+"@"+this.language;
	return string;
}
api.Literal.prototype.n3 = function() {
	return this.toNT();
}
/**
 * Literal#valueOf returns a language-native value - e.g. a number, boolean, or Date where possible
 */
api.Literal.prototype.valueOf = function() {
	if(this.datatype && typeof api.Literal.typeValueOf[this.datatype]=="function"){
		return api.Literal.typeValueOf[this.datatype](this.nominalValue, this.datatype);
	}
	return this.nominalValue;
}
api.Literal.typeValueOf = {};
api.Literal.registerTypeConversion = function(datatype, f){
	api.Literal.typeValueOf[datatype] = f;
}
require('./Default.js').loadDefaultTypeConverters(api.Literal);

/**
 * NamedNode
 */
api.NamedNode = function NamedNode(iri) { this.nominalValue = iri };
api.NamedNode.SCHEME_MATCH = new RegExp("^[a-z0-9-.+]+:", "i");
api.NamedNode.prototype = new api.RDFNode;
api.NamedNode.prototype.nodeType = function nodeType() { return "IRI" };
api.NamedNode.prototype.toNT = function toNT() { return "<" + api.encodeString(this.nominalValue) + ">"; };
api.NamedNode.prototype.n3 = function n3() { return this.toNT(); }

},{"./Default.js":2}],7:[function(require,module,exports){
var parsers = exports;

var Triple = require("./RDFNode.js").Triple;
var IRI = require('iri').IRI;
var env = require('./Builtins.js').environment;
function rdfns(v){return 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'+v;};
function xsdns(v){return 'http://www.w3.org/2001/XMLSchema#'+v;};

parsers.u8 = new RegExp("\\\\U([A-F0-9]{8})", "g");
parsers.u4 = new RegExp("\\\\u([A-F0-9]{4})", "g");
parsers.hexToChar = function hexToChar(hex) {
	var result = "";
	var n = parseInt(hex, 16);
	if(n <= 65535) {
		result += String.fromCharCode(n);
	} else if(n <= 1114111) {
		n -= 65536;
		result += String.fromCharCode(55296 + (n >> 10), 56320 + (n & 1023))
	} else {
		throw new Error("code point isn't known: " + n);
	}
	return result;
};
parsers.decodeString = function decodeString(str) {
	str = str.replace(parsers.u8, function(matchstr, parens) { return parsers.hexToChar(parens); });
	str = str.replace(parsers.u4, function(matchstr, parens) { return parsers.hexToChar(parens); });
	str = str.replace(new RegExp("\\\\t", "g"), "\t");
	str = str.replace(new RegExp("\\\\n", "g"), "\n");
	str = str.replace(new RegExp("\\\\r", "g"), "\r");
	str = str.replace(new RegExp('\\\\"', "g"), '"');
	str = str.replace(new RegExp("\\\\\\\\", "g"), "\\");
	return str;
};

/**
 * Turtle implements DataParser
 * doc param of parse() and process() must be a string
 */
function Turtle(environment) {
	if(!environment) environment = env.createProfile();
	this.environment = environment;
	this.base = new IRI('');
	this.bnHash = {};
	this.filter = null;
	this.processor = null;
	this.quick = null;
	this.graph = null;
	this.blocks = [];
};
parsers.Turtle = Turtle;

Turtle.isWhitespace = new RegExp("^[ \t\r\n#]+", "");
Turtle.initialWhitespace = new RegExp("^[ \t\r\n]+", "");
Turtle.initialComment = new RegExp("^#[^\r\n]*", "");
Turtle.simpleToken = new RegExp("^[^ \t\r\n]+", "");
Turtle.simpleObjectToken = /^(\\[_\~\.\-\!\$&'()*+,;=\/?#@%]|%[0-9A-Fa-f]{2}|[^ \t\r\n;,])+/;
Turtle.tokenInteger = new RegExp("^(-|\\+)?[0-9]+$", "");
Turtle.tokenDouble = new RegExp("^(-|\\+)?(([0-9]+\\.[0-9]*[eE]{1}(-|\\+)?[0-9]+)|(\\.[0-9]+[eE]{1}(-|\\+)?[0-9]+)|([0-9]+[eE]{1}(-|\\+)?[0-9]+))$", "");
Turtle.tokenDecimal = new RegExp("^(-|\\+)?[0-9]*\\.[0-9]+?$", "");

Turtle.prototype.parse = function parse(doc, callback, base, filter, graph) {
	this.graph = graph==null ? env.createGraph() : graph;
	if(base) this.base = new IRI(base.toString());
	this.filter = filter;
	this.quick = false;
	this.parseStatements(new String(doc));
	if((typeof callback)=="function") callback(this.graph);
	return true;
};
Turtle.prototype.process = function(doc, processor, filter) {
	this.processor = processor;
	if(base) this.base = new IRI(base.toString());
	this.filter = filter;
	this.quick = true;
	return this.parseStatements(new String(doc));
};
Turtle.prototype.t = function t(){ return {o:null} };
Turtle.prototype.parseStatements = function(s) {
	var self = this;
	self.blocks = [];
	s = s.toString();
	var originalLength = s.length;
	while(s.length > 0) {
		s = this.skipWS(s);
		if(s.length == 0) return true;
		var type, subject, offset = originalLength - s.length;
		if(s.charAt(0)=="@" || s.substring(0,4).toUpperCase()=='BASE' || s.substring(0,6).toUpperCase()=='PREFIX') {
			s = this.consumeDirective(s);
			type = 'directive';
		} else {
			var t = this.t();
			this.consumeStatementSubject(s, t);
			s = this.consumeStatement(s);
			subject = t.o.toCanonical();
			type = 'statement';
		}
		self.blocks.push({ type: type, subject: subject, start: offset, length: originalLength - s.length - offset });
		s = this.skipWS(s);
	}
	return true;
};
Turtle.prototype.add = function(t) {
	var $use = true;
	if(this.filter != null) $use = this.filter(t, null, null);
	if(!$use) return;
	this.quick ? this.processor(t) : this.graph.add(t);
};
Turtle.prototype.consumeBlankNode = function(s, t) {
	t.o = env.createBlankNode();
	s = this.skipWS(s.slice(1));
	if(s.charAt(0) == "]") return s.slice(1);
	s = this.skipWS(this.consumePredicateObjectList(s, t));
	this.expect(s, "]");
	return this.skipWS(s.slice(1));
};
Turtle.prototype.consumeCollection = function(s, subject) {
	subject.o = env.createBlankNode();
	var listject = this.t();
	listject.o = subject.o;
	s = this.skipWS(s.slice(1));
	var cont = s.charAt(0) != ")";
	if(!cont) { subject.o = rdfns("nil") }
	while(cont) {
		var o = this.t();
		switch(s.charAt(0)) {
			case "[": s = this.consumeBlankNode(s, o); break;
			case "_": s = this.consumeKnownBlankNode(s, o); break;
			case "(": s = this.consumeCollection(s, o); break;
			case "<": s = this.consumeURI(s, o); break;
			case '"': case "'": s = this.consumeLiteral(s, o); break;
			default:
				var token = s.match(Turtle.simpleObjectToken).shift();
				if(token.charAt(token.length - 1) == ")") {
					token = token.substring(0, token.length - 1);
				}
				if(token == "false" || token == "true") {
					o.o = env.createLiteral(token, null, xsdns("boolean"));
				} else if(token.indexOf(":") >= 0) {
					o.o = env.createNamedNode(this.environment.resolve(token));
				} else if(Turtle.tokenInteger.test(token)) {
					o.o = env.createLiteral(token, null, xsdns("integer"));
				} else if(Turtle.tokenDouble.test(token)) {
					o.o = env.createLiteral(token, null, xsdns("double"));
				} else if(Turtle.tokenDecimal.test(token)) {
					o.o = env.createLiteral(token, null, xsdns("decimal"));
				} else {
					throw new Error("Unrecognised token in collection: " + token);
				}
				s = s.slice(token.length);
				break;
		}
		this.add(env.createTriple(listject.o, env.createNamedNode(rdfns("first")), o.o));
		s = this.skipWS(s);
		cont = s.charAt(0) != ")";
		if(cont) {
			this.add(env.createTriple(listject.o, env.createNamedNode(rdfns("rest")), listject.o = env.createBlankNode()));
		} else {
			this.add(env.createTriple(listject.o, env.createNamedNode(rdfns("rest")), env.createNamedNode(rdfns("nil"))));
		}
	}
	return this.skipWS(s.slice(1));
};
Turtle.prototype.consumeDirective = function(s) {
	var p = 0;
	if(s.substring(1, 7) == "prefix") {
		s = this.skipWS(s.slice(7));
		p = s.indexOf(":");
		var prefix = s.substring(0, p);
		s = this.skipWS(s.slice(++p));
		this.expect(s, "<");
		this.environment.setPrefix(prefix, this.base.resolveReference(parsers.decodeString(s.substring(1, p = s.indexOf(">")))).toString());
		s = this.skipWS(s.slice(++p));
		this.expect(s, ".");
		s = s.slice(1);
	} else if(s.substring(0, 6).toUpperCase() == "PREFIX") {
		// SPARQL-style
		s = this.skipWS(s.slice(7));
		p = s.indexOf(":");
		var prefix = s.substring(0, p);
		s = this.skipWS(s.slice(++p));
		this.expect(s, "<");
		this.environment.setPrefix(prefix, this.base.resolveReference(parsers.decodeString(s.substring(1, p = s.indexOf(">")))).toString());
		s = this.skipWS(s.slice(++p));
	} else if(s.substring(1, 5) == "base") {
		s = this.skipWS(s.slice(5));
		this.expect(s, "<");
		this.base = this.base.resolveReference(parsers.decodeString(s.substring(1, p = s.indexOf(">"))));
		s = this.skipWS(s.slice(++p));
		this.expect(s, ".");
		s = s.slice(1);
	} else if(s.substring(0, 4).toUpperCase() == "BASE") {
		// SPARQL-style
		s = this.skipWS(s.slice(5));
		this.expect(s, "<");
		this.base = this.base.resolveReference(parsers.decodeString(s.substring(1, p = s.indexOf(">"))));
		s = this.skipWS(s.slice(++p));
	} else {
		throw new Error("Unknown directive: " + s.substring(0, 50));
	}
	return s;
};
Turtle.prototype.consumeKnownBlankNode = function(s, t) {
	this.expect(s, "_:");
	var bname = s.slice(2).match(Turtle.simpleToken).shift();
	t.o = this.getBlankNode(bname);
	return s.slice(bname.length + 2);
};
Turtle.prototype.consumeLiteral = function(s, o) {
	var char = s[0];
	var value = "";
	var hunt = true;
	var end = 0;
	var longchar = char+char+char;
	if(s.substring(0, 3) == longchar) {
		end = 3;
		while(hunt) {
			end = s.indexOf(longchar, end);
			if(hunt = s.charAt(end - 1) == "\\") end++;
		}
		value = s.substring(3, end);
		s = s.slice(value.length + 6);
	} else {
		while(hunt) {
			end = s.indexOf(char, end + 1);
			hunt = s.charAt(end - 1) == "\\";
		}
		value = s.substring(1, end);
		s = s.slice(value.length + 2);
	}
	value = parsers.decodeString(value);
	switch(s.charAt(0)) {
		case "@":
			var token = s.match(Turtle.simpleObjectToken).shift();
			o.o = env.createLiteral(value, token.slice(1), null);
			s = s.slice(token.length);
			break;
		case "^":
			var token = s.match(Turtle.simpleObjectToken).shift().slice(2);
			if(token.charAt(0) == "<") {
				o.o = env.createLiteral(value, null, token.substring(1, token.length - 1));
			} else {
				o.o = env.createLiteral(value, null, token);
			}
			s = s.slice(token.length + 2);
			break;
		default:
			o.o = env.createLiteral(value, null, null);
			break;
	}
	return s;
};
Turtle.prototype.consumeObjectList = function(s, subject, property) {
	var cont = true;
	while(cont) {
		var o = this.t();
		switch(s.charAt(0)) {
			case "[": s = this.consumeBlankNode(s, o); break;
			case "_": s = this.consumeKnownBlankNode(s, o); break;
			case "(": s = this.consumeCollection(s, o); break;
			case "<": s = this.consumeURI(s, o); break;
			case '"': case "'": s = this.consumeLiteral(s, o); break;
			default:
				var token = s.match(Turtle.simpleObjectToken);
				token = token&&token[0] || "";
				if(token.charAt(token.length - 1) == ".") {
					token = token.substring(0, token.length - 1);
				}
				if(token == "false" || token == "true") {
					o.o = env.createLiteral(token, null, xsdns("boolean"));
				} else if(token.indexOf(":") >= 0) {
					o.o = env.createNamedNode(this.environment.resolve(token));
					if(!o.o) throw new Error('Prefix not defined for '+token);
				} else if(Turtle.tokenInteger.test(token)) {
					o.o = env.createLiteral(token, null, xsdns("integer"));
				} else if(Turtle.tokenDouble.test(token)) {
					o.o = env.createLiteral(token, null, xsdns("double"));
				} else if(Turtle.tokenDecimal.test(token)) {
					o.o = env.createLiteral(token, null, xsdns("decimal"));
				} else {
					throw new Error("Unrecognised token in ObjectList: " + token);
				}
				s = s.slice(token.length);
				break;
		}
		this.add(env.createTriple(subject.o, property, o.o));
		s = this.skipWS(s);
		cont = s.charAt(0)==",";
		if(cont) { s = this.skipWS(s.slice(1)); }
	}
	return s;
};
Turtle.prototype.consumePredicateObjectList = function(s, subject) {
	var cont = true;
	while(cont) {
		var predicate = s.match(Turtle.simpleToken).shift();
		var property = null;
		if(predicate == "a") {
			property = env.createNamedNode(rdfns("type"));
		} else {
			switch(predicate.charAt(0)) {
				case "<":
					property = env.createNamedNode(this.base.resolveReference(parsers.decodeString(predicate.substring(1, predicate.indexOf(">")))).toString());
					break;
				case "]": return s;
				case ".": return s;
				default:
					property = env.createNamedNode(this.environment.resolve(predicate));
					break;
			}
		}
		s = this.skipWS(s.slice(predicate.length));
		s = this.consumeObjectList(s, subject, property);
		cont = s.charAt(0)==";";
		if(cont) { s = this.skipWS(s.slice(1)); }
	}
	return s;
};
Turtle.prototype.consumeQName = function(s, t) {
	var qname = s.match(Turtle.simpleToken).shift();
	t.o = env.createNamedNode(this.environment.resolve(qname));
	return s.slice(qname.length);
};
Turtle.prototype.consumeStatementSubject = function(s, t) {
	switch(s.charAt(0)) {
		case "[":
			s = this.consumeBlankNode(s, t);
			if(s.charAt(0) == ".") return s;
			break;
		case "_": s = this.consumeKnownBlankNode(s, t); break;
		case "(": s = this.consumeCollection(s, t); break;
		case "<": s = this.consumeURI(s, t); break;
		default: s = this.consumeQName(s, t); break;
	}
	return s;
};
Turtle.prototype.consumeStatement = function(s) {
	var t = this.t();
	s = this.consumeStatementSubject(s, t);
	s = this.consumePredicateObjectList(this.skipWS(s), t);
	this.expect(s, ".");
	return s.slice(1);
};
Turtle.prototype.consumeURI = function(s, t) {
	this.expect(s, "<");
	var p = 0;
	t.o = env.createNamedNode(this.base.resolveReference(parsers.decodeString(s.substring(1, p=s.indexOf(">")))).toString());
	return s.slice(++p);
};
Turtle.prototype.expect = function(s, t) {
	if(s.substring(0, t.length) == t) return;
	throw new Error("Expected token: " + t + " at " + JSON.stringify(s.substring(0, 50)));
};
Turtle.prototype.getBlankNode = function(id) {
	if(this.bnHash[id]) return this.bnHash[id];
	return this.bnHash[id]=env.createBlankNode();
};
Turtle.prototype.skipWS = function(s) {
	while(Turtle.isWhitespace.test(s.charAt(0))) {
		s = s.replace(Turtle.initialWhitespace, "");
		if(s.charAt(0) == "#") {
			s = s.replace(Turtle.initialComment, "");
		}
	}
	return s;
};

},{"./Builtins.js":1,"./RDFNode.js":6,"iri":14}],8:[function(require,module,exports){
/**
 * RDF
 *
 * Implement a mash-up of the RDF Interfaces API, the RDF API, and first and foremost whatever makes sense for Node.js
 */

var api = exports;

api.Triple = require('./RDFNode.js').Triple;
api.RDFNode = require("./RDFNode.js").RDFNode;
api.NamedNode = require("./RDFNode.js").NamedNode;
api.BlankNode = require("./RDFNode.js").BlankNode;
api.Literal = require("./RDFNode.js").Literal;

api.Profile = require('./Profile.js').Profile;
api.RDFEnvironment = require('./RDFEnvironment.js').RDFEnvironment;

api.TurtleParser = require('./TurtleParser.js').Turtle;

api.DataSerializer = function(){}

api.Graph = require("./Graph.js").Graph;

api.setObjectProperties = require('./Builtins').setObjectProperties;
api.setStringProperties = require('./Builtins').setStringProperties;
api.setArrayProperties = require('./Builtins').setArrayProperties;
api.setBooleanProperties = require('./Builtins').setBooleanProperties;
api.setDateProperties = require('./Builtins').setDateProperties;
api.setNumberProperties = require('./Builtins').setNumberProperties;
api.environment = require('./Builtins').environment;
api.setBuiltins = require('./Builtins').setBuiltins;
api.ref = require('./Builtins').ref;
api.parse = function(o, id){
	return api.ref.call(o, id);
}

api.ns = function(ns){
	return function(v){return ns+v;};
}
api.rdfns = api.ns('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
api.rdfsns = api.ns('http://www.w3.org/2000/01/rdf-schema#');
api.xsdns = api.ns('http://www.w3.org/2001/XMLSchema#');

},{"./Builtins":1,"./Graph.js":3,"./Profile.js":4,"./RDFEnvironment.js":5,"./RDFNode.js":6,"./TurtleParser.js":7}],9:[function(require,module,exports){

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

},{"./rdf":8}],10:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],11:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],12:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],13:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("JkpR2F"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":12,"JkpR2F":11,"inherits":10}],14:[function(require,module,exports){
var api = exports;

api.encodeString = function encodeString(s) {
	var out = "";
	var skip = false;
	var _g1 = 0, _g = s.length;
	while(_g1 < _g) {
		var i = _g1++;
		if(!skip) {
			var code = s.charCodeAt(i);
			if(55296 <= code && code <= 56319) {
				var low = s.charCodeAt(i + 1);
				code = (code - 55296) * 1024 + (low - 56320) + 65536;
				skip = true;
			}
			if(code > 1114111) { throw new Error("Char out of range"); }
			var hex = "00000000".concat((new Number(code)).toString(16).toUpperCase());
			if(code >= 65536) {
				out += "\\U" + hex.slice(-8);
			} else {
				if(code >= 127 || code <= 31) {
					switch(code) {
						case 9:	out += "\\t"; break;
						case 10: out += "\\n"; break;
						case 13: out += "\\r"; break;
						default: out += "\\u" + hex.slice(-4); break;
					}
				} else {
					switch(code) {
						case 34: out += '\\"'; break;
						case 92: out += "\\\\"; break;
						default: out += s.charAt(i); break;
					}
				}
			}
		} else {
			skip = !skip;
		}
	}
	return out;
}

/**
 * IRI
 */
api.IRI = IRI;
function IRI(iri) { this.value = iri; };
IRI.SCHEME_MATCH = new RegExp("^[a-z0-9-.+]+:", "i");
//IRI.prototype = new api.RDFNode;
IRI.prototype.toString = function toString() { return this.value; }
IRI.prototype.nodeType = function nodeType() { return "IRI"; };
IRI.prototype.toNT = function toNT() { return "<" + api.encodeString(this.value) + ">"; };
IRI.prototype.n3 = function n3() { return this.toNT(); }
IRI.prototype.defrag = function defrag() {
	var i = this.value.indexOf("#");
	return (i < 0) ? this : new IRI(this.value.slice(0, i));
}
IRI.prototype.isAbsolute = function isAbsolute() {
	return this.scheme()!=null && this.heirpart()!=null && this.fragment()==null;
}
IRI.prototype.toAbsolute = function toAbsolute() {
	if(this.scheme() == null && this.heirpart() == null) { throw new Error("IRI must have a scheme and a heirpart!"); }
	return this.resolveReference(this.value).defrag();
}
IRI.prototype.authority = function authority() {
	var heirpart = this.heirpart();
	if(heirpart.substring(0, 2) != "//") return null;
	var authority = heirpart.slice(2);
	var q = authority.indexOf("/");
	return q>=0 ? authority.substring(0, q) : authority;
}
IRI.prototype.fragment = function fragment() {
	var i = this.value.indexOf("#");
	return (i<0) ? null : this.value.slice(i);
}
IRI.prototype.heirpart = function heirpart() {
	var heirpart = this.value;
	var q = heirpart.indexOf("?");
	if(q >= 0) {
		heirpart = heirpart.substring(0, q);
	} else {
		q = heirpart.indexOf("#");
		if(q >= 0) heirpart = heirpart.substring(0, q);
	}
	var q2 = this.scheme();
	if(q2 != null) heirpart = heirpart.slice(1 + q2.length);
	return heirpart;
}
IRI.prototype.host = function host() {
	var host = this.authority();
	var q = host.indexOf("@");
	if(q >= 0) host = host.slice(++q);
	if(host.indexOf("[") == 0) {
		q = host.indexOf("]");
		if(q > 0) return host.substring(0, q);
	}
	q = host.lastIndexOf(":");
	return q >= 0 ? host.substring(0, q) : host;
}
IRI.prototype.path = function path() {
	var q = this.authority();
	if(q == null) return this.heirpart();
	return this.heirpart().slice(q.length + 2);
}
IRI.prototype.port = function port() {
	var host = this.authority();
	var q = host.indexOf("@");
	if(q >= 0) host = host.slice(++q);
	if(host.indexOf("[") == 0) {
		q = host.indexOf("]");
		if(q > 0) return host.substring(0, q);
	}
	q = host.lastIndexOf(":");
	if(q < 0) return null;
	host = host.slice(++q);
	return host.length == 0 ? null : host;
}
IRI.prototype.query = function query() {
	var q = this.value.indexOf("?");
	if(q < 0) return null;
	var f = this.value.indexOf("#");
	if(f < 0) return this.value.slice(q);
	return this.value.substring(q, f)
}
api.removeDotSegments = function removeDotSegments(input) {
	var output = "";
	var q = 0;
	while(input.length > 0) {
		if(input.substr(0, 3) == "../" || input.substr(0, 2) == "./") {
			input = input.slice(input.indexOf("/"));
		}else if(input == "/.") {
			input = "/";
		}else if(input.substr(0, 3) == "/./") {
			input = input.slice(2);
		}else if(input.substr(0, 4) == "/../" || input == "/..") {
			input = (input=="/..") ? "/" : input.slice(3);
			q = output.lastIndexOf("/");
			output = (q>=0) ? output.substring(0, q) : "";
		}else if(input.substr(0, 2) == ".." || input.substr(0, 1) == ".") {
			input = input.slice(input.indexOf("."));
			q = input.indexOf(".");
			if(q >= 0) input = input.slice(q);
		}else {
			if(input.substr(0, 1) == "/") {
				output += "/";
				input = input.slice(1);
			}
			q = input.indexOf("/");
			if(q < 0) {
				output += input;
				input = "";
			}else {
				output += input.substring(0, q);
				input = input.slice(q);
			}
		}
	}
	return output;
}
IRI.prototype.resolveReference = function resolveReference(ref) {
	var reference;
	if(typeof ref == "string") {
		reference = new IRI(ref);
	}else if(ref.nodeType && ref.nodeType() == "IRI") {
		reference = ref;
	}else {
		throw new Error("Expected IRI or String");
	}
	var T = {scheme:"", authority:"", path:"", query:"", fragment:""};
	var q = "";
	if(reference.scheme() != null) {
		T.scheme = reference.scheme();
		q = reference.authority();
		T.authority += q!=null ? "//"+q : "";
		T.path = api.removeDotSegments(reference.path());
		T.query += reference.query()||'';
	}else {
		q = reference.authority();
		if(q != null) {
			T.authority = q!=null ? "//"+q : "";
			T.path = api.removeDotSegments(reference.path());
			T.query += reference.query()||'';
		}else {
			q = reference.path();
			if(q == "" || q == null) {
				T.path = this.path();
				q = reference.query();
				if(q != null) {
					T.query += q;
				}else {
					q = this.query();
					T.query += q!=null ? q : "";
				}
			}else {
				if(q.substring(0, 1) == "/") {
					T.path = api.removeDotSegments(q);
				}else {
					if(this.path() != null) {
						var q2 = this.path().lastIndexOf("/");
						if(q2 >= 0) {
							T.path = this.path().substring(0, ++q2);
						}
						T.path += reference.path();
					}else {
						T.path = "/" + q
					}
					T.path = api.removeDotSegments(T.path);
				}
				T.query += reference.query()||'';
			}
			q = this.authority();
			T.authority = q!=null ? "//" + q : "";
		}
		T.scheme = this.scheme();
	}
	T.fragment = reference.fragment()||'';
	return new IRI(T.scheme + ":" + T.authority + T.path + T.query + T.fragment);
}
IRI.prototype.scheme = function scheme() {
	var scheme = this.value.match(IRI.SCHEME_MATCH);
	return (scheme == null) ? null : scheme.shift().slice(0, -1);
}
IRI.prototype.userinfo = function userinfo() {
	var authority = this.authority();
	var q = authority.indexOf("@");
	return (q < 0) ? null : authority.substring(0, q);
}
IRI.prototype.toURIString = function toURIString(){
	return this.value.replace(/([\uA0-\uD7FF\uE000-\uFDCF\uFDF0-\uFFEF]|[\uD800-\uDBFF][\uDC00-\uDFFF])/g, function(a){return encodeURI(a);});
}
IRI.prototype.toIRIString = function toIRIString(){
	// HEXDIG requires capital characters
	// 80-BF is following bytes, (%[89AB][0-9A-F])
	// 00-7F no bytes follow (%[0-7][0-9A-F])(%[89AB][0-9A-F]){0}
	// C0-DF one byte follows (%[CD][0-9A-F])(%[89AB][0-9A-F]){1}
	// E0-EF two bytes follow (%[E][0-9A-F])(%[89AB][0-9A-F]){2}
	// F0-F7 three bytes follow (%[F][0-7])(%[89AB][0-9A-F]){3}
	// F8-FB four bytes follow (%[F][89AB])(%[89AB][0-9A-F]){4}
	// FC-FD five bytes follow (%[F][CD])(%[89AB][0-9A-F]){5}
	var utf8regexp = /%([2-7][0-9A-F])|%[CD][0-9A-F](%[89AB][0-9A-F])|%[E][0-9A-F](%[89AB][0-9A-F]){2}|%[F][0-7](%[89AB][0-9A-F]){3}|%[F][89AB](%[89AB][0-9A-F]){4}|%[F][CD](%[89AB][0-9A-F]){5}/g;
	// reserved characters := gen-delims, space, and sub-delims
	// : / ? # [ ] @   ! $ & ' ( ) * + , ; =
	var reserved = [ '3A', '2F', '3F', '23', '5B', '5D', '40', '20', '21', '24', '26', '27', '28', '29', '2A', '2B', '2C', '3B', '3D'];
	var iri = this.toString().replace(utf8regexp, function(a, b){
		if(reserved.indexOf(b)>=0) return a;
		return decodeURIComponent(a);
	});
	return iri;
}

IRI.prototype.toIRI = function toIRI(){
	return new IRI(this.toIRIString());
}

// Create a new IRI object and decode UTF-8 escaped characters
api.fromURI = function fromURI(uri){
	return new IRI(uri).toIRI();
}

api.toIRIString = function toIRIString(uri){
	return new IRI(uri).toIRIString();
}

},{}]},{},[9]);