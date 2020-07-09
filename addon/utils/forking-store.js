import rdflib from 'ember-rdflib';

const { Fetcher, UpdateManager, namedNode, Statement } = rdflib;
const BASE_GRAPH_STRING = "http://mu.semte.ch/libraries/rdf-store";

/**
 * Yields the graphs which contains additions.
 */
function addGraphFor( graph ) {
  const graphValue = graph.termType == 'NamedNode' ? graph.value : graph;
  const base = `${BASE_GRAPH_STRING}/graphs/add`;
  const graphQueryParam = encodeURIComponent( graphValue );
  return namedNode( `${base}?for=${graphQueryParam}` );
}

/**
 * Yieldsthe graph which contains removals.
 */
function delGraphFor( graph ) {
  const graphValue = graph.termType == 'NamedNode' ? graph.value : graph;
  const base = `${BASE_GRAPH_STRING}/graphs/del`;
  const graphQueryParam = encodeURIComponent( graphValue );
  return namedNode( `${base}?for=${graphQueryParam}` );
}

function mergedGraphFor( graph ) {
  const graphValue = graph.termType == 'NamedNode' ? graph.value : graph;
  const base = `${BASE_GRAPH_STRING}/graphs/merged`;
  const graphQueryParam = encodeURIComponent( graphValue );
  return namedNode( `${base}?for=${graphQueryParam}` );
}


function statementInGraph( quad, graph ) {
  return new Statement( quad.subject, quad.predicate, quad.object, graph );
}

function informObservers( payload, forkingStore ) {
  for( const observerKey in forkingStore.observers ) {
    try {
      forkingStore.observers[observerKey]( payload );
    } catch(e) {
      console.error(`Something went wrong during the callback of observer ${ observerKey }`);
      console.error( e );
    }
  }
};

export default class ForkingStore {
  graph = null;
  fetcher = null;
  updater = null;

  observers = null;

  constructor(){
    this.graph = rdflib.graph();
    this.fetcher = new Fetcher( this.graph );
    this.updater = new UpdateManager( this.graph );
    this.observers = {};
  }

  /**
   * Load data from an external graph.
   */
  async load(source){
    // TODO: should we remove our changes when a graph is being reloaded?
    await this.fetcher.load( source );
  }

  loadDataWithAddAndDelGraph(content, graph, additions, removals, format){
    const graphValue = graph.termType == 'NamedNode' ? graph.value : graph;
    rdflib.parse( content, this.graph, graphValue , format );
    if(additions){
      rdflib.parse( additions, this.graph, addGraphFor( graph ).value, format );
    }
    if(removals){
      rdflib.parse( removals, this.graph, delGraphFor( graph ).value, format );
    }
  }

  serializeDataWithAddAndDelGraph(graph, format = 'text/turtle'){
    return {
      graph: rdflib.serialize(graph, this.graph, format),
      additions: rdflib.serialize(addGraphFor(graph), this.graph, format),
      removals: rdflib.serialize(delGraphFor(graph), this.graph, format)
    };
  }

  serializeDataMergedGraph(graph, format = 'text/turtle'){
    return rdflib.serialize(this.mergedGraph(graph), this.graph, format);
  }

  /**
   * Parses content from a file into a specified graph.
   */
  parse( content, graph, format ) {
    const graphValue = graph.termType == 'NamedNode' ? graph.value : graph;
    rdflib.parse( content, this.graph, graphValue , format );
  }

  /**
   * Perform a match on the graph.
   */
  match( subject, predicate, object, graph ) {
    if( graph ) {
      const mainMatch = this.graph.match( subject, predicate, object, graph );
      const addMatch = this.graph.match( subject, predicate, object, addGraphFor( graph ) );
      const delMatch = this.graph.match( subject, predicate, object, delGraphFor( graph ) );
      return [ ...mainMatch, ...addMatch ]
        .filter( (quad) => ! delMatch.find( (del) => this.equalTriples( del, quad ) ) ) // remove statments in delete graph
        .map( (quad) => statementInGraph( quad, graph ) ) // map them to the requested graph
        .reduce( (acc, quad) => { // find uniques
          if(! acc.find( accQuad => this.equalTriples( accQuad, quad) )){
            acc.push(quad);
          }
          return acc;
        }, []);
    } else {
      // TODO: this code path is normally unused in our cases,
      // implement it for debugging scenarios.

      return this.graph.match( subject, predicate, object );
    }
  }

  /**
   * internal to compare triples
   */
  equalTriples(a, b){
    return a.subject.equals(b.subject) && a.predicate.equals(b.predicate) && a.object.equals(b.object);
  }

  /**
   * Perform any match on the graph.
   */
  any( subject, predicate, object, graph ) {
    const matches = this.match( subject, predicate, object, graph );

    if( matches.length > 0 ) {
      const firstMatch = matches[0];
      if( !subject )
        return firstMatch.subject;
      if( !predicate )
        return firstMatch.predicate;
      if( !object )
        return firstMatch.object;
      if( !graph )
        return firstMatch.graph;
      return true;
    } else {
      return undefined;
    }
  }

  addAll( inserts ) {
    for( const ins of inserts ) {
      this.graph.add( statementInGraph( ins, addGraphFor( ins.graph ) ) );
      try {
        this.graph.remove( statementInGraph( ins, delGraphFor( ins.graph ) ) );
      } catch (e) {
        // this is okay!  the statement may not exist
      }
    }
    informObservers( { inserts }, this );
  }

  removeStatements( deletes ) {
    for( const del of deletes ) {
      this.graph.add( statementInGraph( del, delGraphFor( del.graph ) ) );
      try {
        this.graph.remove( statementInGraph( del, addGraphFor( del.graph ) ) );
      } catch (e) {
        // this is okay!  the statement may not exist
      }
    }
    informObservers( { deletes }, this );
  }

  removeMatches( subject, predicate, object, graph ) {
    // TODO: this should go through forking methods
    const matches = this.graph.match( subject, predicate, object, graph );
    this.graph.removeStatements( matches );
  }

  allGraphs(){
    const graphStatements =
          this
          .graph
          .match()
          .map( ({graph}) => graph.value );

    return new Set( graphStatements );
  }

  changedGraphs(){
    const forGraphs = new Set();
    for( const graph of this.allGraphs() ) {
      let url;
      try {
        url = new URL( graph );
      } catch(e) { /* this may happen */ };

      if( url
          && ( url.href.startsWith( `${BASE_GRAPH_STRING}/graphs/add` )
              || url.href.startsWith( `${BASE_GRAPH_STRING}/graphs/del`) ) ) {
        const target = url.searchParams.get("for");
        if( target ) forGraphs.add( target );
      }
    }

    return [...forGraphs];
  }

  mergedGraph( graph ) {
    // recalculates the merged graph and returns the graph

    const mergedGraph = mergedGraphFor( graph );
    const delSource = delGraphFor( graph );
    const addSource = addGraphFor( graph );

    const baseContent =
          this
          .match( null, null, null, graph )
          .map( (statement) => statementInGraph( statement, mergedGraph ) );
    const delContent =
          this
          .match( null, null, null, delSource )
          .map( (statement) => statementInGraph( statement, mergedGraph ) );
    const  addContent =
          this
          .match( null, null, null, addSource )
          .map( (statement) => statementInGraph( statement, mergedGraph ) );

    // clear the graph
    this.graph.removeMatches( null, null, null, mergedGraph );
    // add baseContent
    baseContent.forEach( (statement) => this.graph.add( statement ) );
    // remove stuff
    delContent.forEach( (statement) => {
      try { this.graph.remove( statement ); } catch(e) {};
    } );
    // add stuff
    addContent.forEach( (statement) => this.graph.add( statement ) );

    return mergedGraph;
  }

  async pushGraphChanges( graph ) {
    const deletes =
          this
          .match( null, null, null, delGraphFor( graph ) )
          .map( (statement) => statementInGraph( statement, graph ) );

    const inserts =
          this
          .match( null, null, null, addGraphFor( graph ) )
          .map( (statement) => statementInGraph( statement, graph ) );

    try {
      await this.update( deletes, inserts );
    } finally {
      this.removeMatches( null, null, null, delGraphFor( graph ) );
      this.removeMatches( null, null, null, addGraphFor( graph ) );
    }
  }

  async persist() {
    return await Promise.all(
      this
        .changedGraphs()
        .map( (graphString) => namedNode( graphString ) )
        .map( (graph) => this.pushGraphChanges( graph ) )
    );
  }

  /**
   * Promise based version of update protocol
   * private
   */
  update( deletes, inserts ) {
    return new Promise( ( resolve, reject ) =>  {
      this.updater.update(
        deletes, inserts,
        resolve, reject );
    } );
  }

  /**
   * Registers an observer, optionally with a key.  The observer will
   * be called with objects of the shape { deletes, inserts } for any
   * change that is passed through `this.update`.
   */
  registerObserver( observer, key ) {
    key = key || observer;
    this.observers[key] = observer;
  }

  deregisterObserver( key ) {
    delete this.observers[key];
  }
}

export { addGraphFor, delGraphFor }
