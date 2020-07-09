import { inject as service } from '@ember/service';
import { setOwner, getOwner } from '@ember/application';
import { tracked } from '@glimmer/tracking';
import { get, set } from '@ember/object';
import { XSD, RDF, SOLID } from '../utils/namespaces';
import rdflib from 'ember-rdflib';
import env from '../config/environment';

const { Statement } = rdflib;

function sendAlert( message ) {
  console.error( ...arguments ); // TODO: these happen too much, fix in ForkingStore
}

function cacheKeyForAttr( attr ) {
  return `#cache__${attr}`;
}

function graphForType( type, store ) {
  return store.discoverDefaultGraphByType( store.classForModel( type ) );
}

function graphForInstance( entity, propertyName ) {
  const entityGraph = entity.store.getGraphForType( entity.modelName );
  const defaultGraph = entity.defaultGraph;

  if( propertyName ) {
    const options = entity.attributeDefinitions[propertyName];
    if( options.model && options.inverse ) {
      return graphForType( options.model, entity.store );
    } else {
      return options.graph || entityGraph || defaultGraph;
    }
  } else {
    return entityGraph || defaultGraph;
  }
}

async function changeGraphTriples( entity, del, ins, options = {} ) {
  const validStatement = function(statement) {
    return statement.subject.value !== null && statement.predicate.value !== null && statement.object.value !== null;
  };

  del = del.filter( validStatement );
  ins = ins.filter( validStatement );
  
  const modelName = options.modelName || entity.modelName;
  const store = options.store || entity.store;
  if( modelName && store.getAutosaveForType( modelName ) ) {
    // push the data
    await store.update( del, ins );
  }
    
  // store the data through the graph immediately
  store.addAll( ins );
  store.removeStatements( del );
}

function calculatePropertyValue( target, propertyName ) {
  let value;
  const options = target.attributeDefinitions[propertyName];
  const predicate = calculatePredicateForProperty( target, propertyName );
  const graph = graphForInstance( target, propertyName );
  const response = options.inverse ? target.store.any(undefined, predicate, target.uri, graph) : target.store.any(target.uri, predicate, undefined, graph);
  
  const createRelatedRecordOptions = { defaultGraph: options.propagateDefaultGraph ? target.defaultGraph : undefined };

  switch (options.type) {
  case "string":
    value = response && response.value;
    break;
  case "integer":
    value = response && parseInt( response.value );
    break;
  case "term":
    value = response;
    break;
  case "dateTime":
    value = response && new Date( response.value );
    break;
  case "belongsTo":
    value = response && target.store.create( options.model, response, createRelatedRecordOptions );
    break;
  case "hasMany":
    var matches;
    if( options.inverse ) {
      let sourceGraph = graphForType( options.model, target.store );

      matches =
        target
        .store
        .match( undefined, predicate, target.uri, sourceGraph )
        .map( ({subject}) => subject );
    } else {
      matches =
        target
        .store
        .match( target.uri, predicate, undefined, graph )
        .map( ({object}) => object );
    }

    value =
      matches
      .map( (uri) =>
            target.store.create( options.model, uri, createRelatedRecordOptions ) );
    break;
  case undefined:
    value = response && response.value;
    break;
  }

  return value;
}

function updatePropertyValue( entity, propertyName ) {
  const cacheKey = cacheKeyForAttr( propertyName );
  const newValue = calculatePropertyValue( entity, propertyName );
  set( entity, cacheKey, newValue );
}

function calculatePredicateForProperty( entity, propertyName ) {
  const options = entity.attributeDefinitions[propertyName];
  return options.predicate || ( options.ns && options.ns( propertyName ) ) || entity.defaultNamespace( propertyName );
}

function property(options = {}) {
  const predicateUri = options.predicate;

  return function(self, propertyName, descriptor) {
    self.attributes = self.attributes ? self.attributes : [];
    self.attributes.push( propertyName );

    const cacheKey = cacheKeyForAttr( propertyName );

    self.attributeDefinitions = self.attributeDefinitions || {};
    self.attributeDefinitions[propertyName] = Object.assign({ cacheKey }, options);

    const calculatePredicate = function(entity){
      return calculatePredicateForProperty( entity, propertyName );
    };

    // Object.defineProperty( self, cacheKey, { enumerable: false, writable: true } );

    // The current implementation does a get/set of the property
    // "cacheKey" which will make this autotrack the cached property.
    // As such we don't need to manually call notifyPropertyChange.
    // This does mean that we're trying to be smart about reading the
    // property so that we don't accidentally overlap.

    return {
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable,
      get() {
        if( this[cacheKey] !== undefined ) {
          return get( this, cacheKey ); // register as a dependency
        } else {
          let value = calculatePropertyValue( this, propertyName );
          set( this, cacheKey, value );
          return get( this, cacheKey ); // register as a dependency after setting
        }
      },
      set(value) {
        const predicate = calculatePredicate(this);
        const graph = graphForInstance( this, propertyName );
        const setRelationObject = function( object ) {
          const del = this.store.match( this.uri, predicate, undefined, graph );
          const ins = [ new Statement( this.uri, predicate, object, graph ) ];
          changeGraphTriples( this, del, ins )
            .then( (uri, message, response) => console.log(`Success updating: ${message}`) )
            .catch( (message, uri, response) => sendAlert(message, { uri, message, response }) );
        }.bind(this);

        let object;
        switch (options.type) {
        case "string":
          setRelationObject( new rdflib.Literal( value ) );
          break;
        case "integer":
          setRelationObject( new rdflib.Literal( value, null, XSD("decimal") ) );
          break;
        case "dateTime":
          setRelationObject( new rdflib.Literal( value.toUTCString(), null, XSD("dateTime") ) );
          break;
        case "belongsTo":
          setRelationObject( value.uri );
          // invalidate inverse relation
          if( options.inverseProperty ) updatePropertyValue( value, options.inverseProperty );
          break;
        case "hasMany":
          const newObjects = new Set(value);
          const oldObjects = new Set(this[cacheKey] || []);

          let statementsToRemove = [];
          let statementsToAdd = [];

          if( !oldObjects ) {
            // remove all values if we haven't cached them
            // TODO: this case is not supported for now
            console.error("Not removing matches in remote store which might exist");
            this.store.removeMatches( this.uri, predicate, undefined, graph );
          }

          const objectsToAdd = new Set( newObjects );
          oldObjects.forEach( (o) => objectsToAdd.delete( o ) );
          const objectsToRemove = new Set( oldObjects );
          newObjects.forEach( (o) => objectsToRemove.delete( o ) );
          
          objectsToRemove.forEach( (obj) => {
            statementsToRemove.push( new rdflib.Statement( this.uri, predicate, obj.uri, graph ) );
          } );
          objectsToAdd.forEach( (obj) => {
            statementsToAdd.push( new rdflib.Statement( this.uri, predicate, obj.uri, graph ) );
          } );

          changeGraphTriples( this, statementsToRemove, statementsToAdd )
            .then( (uri, message, response ) => console.log(`Success updating: ${message}`) )
            .catch( (message, uri, response ) => sendAlert(message, { uri, message, response }) ); // TODO: revert property update and recover

          // invalidate inverse relations
          [...objectsToAdd, ...objectsToRemove].forEach( (obj) => {
            if( options.inverseProperty ) updatePropertyValue( obj, options.inverseProperty );
          } );
          break;
        case "term":
          setRelationObject( object );
          break;
        }

        set( this, cacheKey, value ); // update dependent key

        // update the change listeners, if any
        for( let listener of this.changeListeners )
          listener( this, { updatedField: propertyName, newValue: value } );

        return value;
      }
    };
  };
}

function string( options = {} ) {
  options.type = "string";
  return property( options );
}

function integer( options = {} ) {
  options.type = "integer";
  return property( options );
}

function dateTime( options = {} ) {
  options.type = "dateTime";
  return property( options );
}

function term( options = {} ) {
  options.type = "term";
  return property( options );
}

function hasMany( options = {} ) {
  options.type = "hasMany";
  console.assert( options.model, "hasMany requires 'model' to be supplied" );
  return property( options );
}

function belongsTo( options = {} ) {
  options.type = "belongsTo";
  return property( options );
}

class SemanticModel {
  @tracked uri;
  defaultNamespace = null;

  modelName = null;

  changeListeners = new Set();

  create(){
    console.log(...arguments);
  }

  @service(env.RSTORE.name) store;

  constructor( uri, options = {} ){
    const store = options.store;

    if( options.defaultGraph )
      this.defaultGraph = options.defaultGraph;
    else if( this.constructor.solid ) {
      this.defaultGraph = options.store.discoverDefaultGraphByType( this.constructor );
    }

    if( options.defaultNamespace )
      this.defaultNamespace = options.defaultNamespace;
    if( options.modelName ) {
      this.modelName = options.modelName;
    }

    this.uri = uri;

    if( this.rdfType || this.constructor.rdfType )
      this.rdfType = this.rdfType || this.constructor.rdfType;

    ensureResourceExists( this, options );
  }

  addChangeListener( listener ) {
    this.changeListeners.add( listener );
  }
  removeChangeListener( listener ) {
    this.changeListeners.delete( listener );
  }
}

function ensureResourceExists( entity, options ) {
  const rdfType = entity.rdfType;
  // We cannot use graphForInstance here because the entity is not fully defined yet.
  const targetGraph = options.store.getGraphForType( entity.modelName ) || entity.defaultGraph;

  if( entity.uri && rdfType ) {
    const matches =
          options
          .store
          .match(entity.uri, undefined, rdfType, targetGraph)
          .filter( ({predicate}) => predicate.value == RDF("type").value )
          .length;

    if( matches == 0 )
      changeGraphTriples(
        this,
        [],
        [ new rdflib.Statement( entity.uri, RDF("type"), rdfType, targetGraph ) ],
        options )
      .then( (uri, message, response) => console.log(`Success updating: ${message}`) )
      .catch( (message, uri, response ) => sendAlert(message, { uri, message, response }) );
  }
}

function rdfType(typeUri) {
  return function(klass) {
    klass.rdfType = typeUri;
  };
}

function defaultGraph(graphUri) {
  return function(klass) {
    klass.defaultGraph = graphUri;
  };
}

function autosave( bool = true ) {
  return function(klass) {
    klass.autosave = bool;
  };
}

function solid( options ) {
  return function(klass) {
    klass.solid = options;
  };
}

export default SemanticModel;
export { property, string, integer, dateTime, hasMany, belongsTo, term, solid };
export { rdfType, defaultGraph, autosave };
