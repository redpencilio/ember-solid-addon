import rdflib from 'ember-rdflib';

const FORM_GRAPH = new rdflib.NamedNode("http://mu.semte.ch/form");
const SOURCE_GRAPH = new rdflib.NamedNode("http://mu.semte.ch/dilbeek");
const SOURCE_NODE = new rdflib.NamedNode("http://mu.semte.ch/vocabularies/ext/besluitenlijsten/208ee6e0-28b1-11ea-972c-8915ff690069");
const META_GRAPH = new rdflib.NamedNode("http://mu.semte.ch/metagraph");

export { FORM_GRAPH, SOURCE_GRAPH, SOURCE_NODE, META_GRAPH };
