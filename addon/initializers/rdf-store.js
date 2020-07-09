import Service from '@ember/service';
import rdflib from 'ember-rdflib';
import { getOwner, setOwner } from '@ember/application';
import { RDF, SOLID } from '../utils/namespaces';
import env from '../config/environment';
import ForkableStore from '../utils/forking-store';

const { namedNode } = rdflib;

function classForModel( owner, model ) {
  return owner.lookup( `model:${model}` );
}

function findTypeRegistrationInGraph( type, store, typeGraph ) {
  return store
    .match( undefined, RDF("type"), SOLID("TypeRegistration"), typeGraph )
    .map( ({subject: typeIndexSpec}) => {
      const hasProjectType =
            store
            .match( typeIndexSpec, SOLID("forClass"), undefined, typeGraph )
            .filter( ({object}) => object.value == type.value )
            .length;
      const location =
            store
            .any( typeIndexSpec, SOLID("instance"), undefined, typeGraph );

      return hasProjectType ? location : false;
    })
    .find( (x) => x );
}

class StoreService extends Service {
  store = null;

  storeCache = {}

  changeListeners = new Set();

  privateTypeIndex = null;
  publicTypeIndex = null;
  me = null;

  constructor() {
    super(...arguments);
    this.store = new ForkableStore();
  }

  match() { return this.store.match( ...arguments ); }
  any() { return this.store.any( ...arguments ); }
  addAll() { return this.store.addAll( ...arguments ); }
  removeStatements() { return this.store.removeStatements( ...arguments ); }
  removeMatches() { return this.store.removeMatches( ...arguments ); }
  async load(source) { return await this.store.load( source ); }
  async update(deletes, inserts) { return await this.store.update( deletes, inserts ); }
  async persist() { return await this.store.persist(); }

  create( model, uri, options ) {
    // check the cache
    const peekedInstance = this.peekInstance( model, uri );
    if( peekedInstance ) return peekedInstance;

    // create a new instance
    const owner = getOwner(this);
    const klass = classForModel( owner, model );
    const createOptions = Object.assign({}, options);
    createOptions.store = this;
    createOptions.modelName = model;
    const instance = new klass( uri, createOptions );
    setOwner( instance, owner );
    this.storeCacheForModel( model ).push( instance );

    // notify listeners
    for (let listener of this.changeListeners)
      window.setTimeout( () => listener( model, instance ), 0 );

    return instance;
  }

  storeCacheForModel( model ) {
    return this.storeCache[model] || (this.storeCache[model] = []);
  }

  peekInstance( model, uri ) {
    if( !uri )
      uri = model;

    const uriValue = uri.value ? uri.value : uri;
     
    if( model ) {
      return this
        .storeCacheForModel(model)
        .find( (obj) => obj.uri.value === uriValue );
    } else {
      for( let key in this.storeCache ) {
        let matchingInstance =
            this.storeCache[key].find( (obj) => obj.uri.value === uriValue );
        if( matchingInstance ) return matchingInstance;
      }
      return undefined;
    }
  }

  all( model, options ) {
    // TODO: options should have the option to yield a live array.
    // Use a weak map to find which maps to update.
    const klass = classForModel( getOwner( this ), model );
    if( !klass.rdfType )
      console.error( `Tried to fetch all instances of ${model} but it has no @rdfType annotation.` );

    const sourceGraph = this.discoverDefaultGraphByType( klass );

    return this
      .match( undefined, RDF("type"), klass.rdfType, sourceGraph )
      .map( ({subject}) => this.create( model, subject ) );
  }

  classForModel( model ) {
    return classForModel( getOwner( this ), model );
  }

  async fetchGraphForType( model ) {
    const klass = classForModel( getOwner( this ), model );
    if( !klass.rdfType )
      console.error( `Tried to fetch all instances of ${model} but it has no @rdfType annotation.` );

    const sourceGraph = this.discoverDefaultGraphByType( klass );

    try {
      await this.load( sourceGraph );
    } catch(e){
      console.log(`Failed to fetch ${sourceGraph.value}`);
      console.log(e);
    }
  }

  discoverDefaultGraphByType( constructor ) {
    let discoveredSolidGraph = null;

    if( constructor.solid.private )
      discoveredSolidGraph = findTypeRegistrationInGraph( constructor.rdfType, this, this.privateTypeIndex );
    else
      discoveredSolidGraph = findTypeRegistrationInGraph( constructor.rdfType, this, this.publicTypeIndex );

    // TODO: if a defaultStorageLocation was set, and the type was not
    // found in the type index, write the storage location the correct
    // type index.

    let absoluteGraph = constructor.solid.defaultStorageLocation
        && this.me
        && namedNode( new URL( constructor.solid.defaultStorageLocation, this.me.doc().value ).href );

    return discoveredSolidGraph || absoluteGraph || this.contructor.defaultGraph;
  }

  graphForType = {}
  setGraphForType(type, graph) {
    this.graphForType[type] = graph;
  }
  getGraphForType(type) {
    return this.graphForType[type];
  }

  autosaveForType = {};
  setAutosaveForType(type, autosave) {
    this.autosaveForType[type] = autosave;
  }
  getAutosaveForType(type) {
    const autosave = this.autosaveForType[type];

    if( autosave !== undefined ) {
      return autosave;
    } else {
      return classForModel( getOwner( this ), type ).autosave;
    }
  }

  addChangeListener(listener) {
    this.changeListeners.add( listener );
  }

  removeChangeListener(listener) {
    this.changeListeners.remove( listener );
  }
}

export function initialize( application ) {
  application.register(`service:${env.RSTORE.name}`, StoreService, { singleton: true, instantiate: true });
}

export default {
  initialize,
  name: "rdf-store",
};
