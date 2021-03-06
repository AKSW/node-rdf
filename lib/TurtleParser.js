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
