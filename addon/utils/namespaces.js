import rdflib from 'ember-rdflib';

const RDF = new rdflib.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
const FORM = new rdflib.Namespace("http://lblod.data.gift/vocabularies/forms/");
const SHACL = new rdflib.Namespace("http://www.w3.org/ns/shacl#");
const SKOS = new rdflib.Namespace("http://www.w3.org/2004/02/skos/core#");
const XSD = new rdflib.Namespace("http://www.w3.org/2001/XMLSchema#");
const VCARD = new rdflib.Namespace("http://www.w3.org/2006/vcard/ns#");
const FOAF = new rdflib.Namespace("http://xmlns.com/foaf/0.1/");
const LDP = new rdflib.Namespace("http://www.w3.org/ns/ldp#");
const SP = new rdflib.Namespace("http://www.w3.org/ns/pim/space#");
const SOLID = new rdflib.Namespace("http://www.w3.org/ns/solid/terms#");
const DCT = new rdflib.Namespace("http://purl.org/dc/terms/");
const TRACKER = new rdflib.Namespace("http://mu.semte.ch/tracker/");

export { RDF, FORM, SHACL, SKOS, XSD, VCARD, FOAF, LDP, SP, SOLID, DCT, TRACKER };
