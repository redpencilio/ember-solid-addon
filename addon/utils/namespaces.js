import rdflib from 'rdflib';

const ns = {
  rdf: rdflib.Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
  form: rdflib.Namespace('http://lblod.data.gift/vocabularies/forms/'),
  shacl: rdflib.Namespace('http://www.w3.org/ns/shacl#'),
  skos: rdflib.Namespace('http://www.w3.org/2004/02/skos/core#'),
  xsd: rdflib.Namespace('http://www.w3.org/2001/XMLSchema#'),
  vcard: rdflib.Namespace('http://www.w3.org/2006/vcard/ns#'),
  foaf: rdflib.Namespace('http://xmlns.com/foaf/0.1/'),
  ldp: rdflib.Namespace('http://www.w3.org/ns/ldp#'),
  sp: rdflib.Namespace('http://www.w3.org/ns/pim/space#'),
  solid: rdflib.Namespace('http://www.w3.org/ns/solid/terms#'),
  dct: rdflib.Namespace('http://purl.org/dc/terms/'),
  tracker: rdflib.Namespace('http://mu.semte.ch/tracker/'),
  schema: rdflib.Namespace('http://schema.org/'),
  ext: rdflib.Namespace('http://mu.semte.ch/vocabularies/ext/'), // use this as a dump for things you don't find
};

function setNamespace(label, value) {
  ns[label] = rdflib.Namespace(value);
  return ns[label];
}

function setNamespaces(definitions) {
  definitions.forEach((def) => {
    const [key, value] = def.split(':');
    ns[key.trim] = value.trim;
  });
}

/**
 * Converts a thing into a namespace.
 *
 * Understands various helpers:
 * - Namespace stays a namespace
 * - "foo:" is converted into "foo" and it's searched in the known namespaces.
 * - "foo" is searched in the known namespaces.
 * - other strings are converted into a namespace
 *
 * If nothing is found, undefined is returned.
 */
function toNamespace(thing) {
  if (typeof thing === 'function') return thing;
  else if (typeof thing === 'string' && thing[thing.length - 1] === ':')
    return ns[thing.slice(0, thing.length - 1)];
  else if (typeof thing === 'string' && thing.indexOf(':') === -1)
    return ns[thing];
  else if (typeof thing === 'string') return rdflib.Namespace(thing);
  else return undefined;
}

/**
 * Converts a thing into a NamedNode.
 *
 * Understands namespaces, strings, and NamedNode instances.
 */
function toNamedNode(thing) {
  if (thing instanceof rdflib.NamedNode) {
    return thing;
  } else if (typeof thing === 'string' && thing.indexOf(':') !== -1) {
    const ns = toNamespace(thing.slice(0, thing.indexOf(':')));
    if (ns) return ns(thing.slice(thing.indexOf(':') + 1));
    else return new rdflib.NamedNode(thing); // maybe a mailto: or ipfs: or http:
  } else {
    return undefined; // nothing sensible to do, URIs have a :
  }
}

const RDF = ns.rdf;
const SCHEMA = ns.schema;
const TRACKER = ns.tracker;
const DCT = ns.dct;
const SOLID = ns.solid;
const SP = ns.sp;
const LDP = ns.ldp;
const FOAF = ns.foaf;
const VCARD = ns.vcard;
const XSD = ns.xsd;
const SKOS = ns.skos;
const SHACL = ns.shacl;
const FORM = ns.form;
const EXT = ns.ext;

export {
  RDF,
  SCHEMA,
  EXT,
  FORM,
  SHACL,
  SKOS,
  XSD,
  VCARD,
  FOAF,
  LDP,
  SP,
  SOLID,
  DCT,
  TRACKER,
};
export { setNamespace, setNamespaces };
export { toNamespace, toNamedNode };
