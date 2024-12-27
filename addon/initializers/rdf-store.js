import Service from '@ember/service';
import rdflib from 'rdflib';
import { getOwner, setOwner } from '@ember/application';
import { RDF, SOLID } from '../utils/namespaces';
import env from 'ember-get-config';
import ForkableStore from '../utils/forking-store';

const { namedNode } = rdflib;

/**
 *
 * Looks up a model-class
 *
 * @param owner The ember owner
 * @param {String} model Name of the model to lookup
 */
function classForModel(owner, model) {
  if (!model || typeof model !== 'string') {
    console.error("Invalid model name:", model);
    throw new Error("Model name must be a non-empty string");
  }


  try {
    return owner.lookup(`model:${model}`);
  } catch (error) {
    console.error("Error looking up model:", error);
    throw error;
  }
}

/**
 *
 * Queries a typeGraph in a local Forkingstore for a type
 *
 * @param {NamedNode} type The type to search
 * @param {ForkingStore} store The store to query
 * @param {NamedNode} typeGraph The type-graph
 */
function findTypeRegistrationInGraph(type, store, typeGraph) {
  return store
    .match(undefined, RDF("type"), SOLID("TypeRegistration"), typeGraph)
    .map(({ subject: typeIndexSpec }) => {
      const hasProjectType =
        store
          .match(typeIndexSpec, SOLID("forClass"), undefined, typeGraph)
          .filter(({ object }) => object.value == type.value)
          .length;
      const location =
        store
          .any(typeIndexSpec, SOLID("instance"), undefined, typeGraph);

      return hasProjectType ? location : false;
    })
    .find((x) => x);
}

/**
 *
 * Ember service that communicates with a Forking-store to query and send data from/to a Solid pod
 *
 * @class StoreService
 *
 * @property {ForkingStore} store The forking store to query
 * @property {Object} storeCache Local cache of triples
 * @property {Set} changeListeners
 * @property {NamedNode} privateTypeIndex The private type index node of the solid pod
 * @property {NamedNode} publicTypeIndex The public type index node of the solid pod
 * @property {NamedNode} me The node representing the me-subject of the solid pod
 */
class StoreService extends Service {
  store = null;

  storeCache = {}

  changeListeners = new Set();

  privateTypeIndex = null;
  publicTypeIndex = null;
  authSession = null;
  podBase = null;

  constructor() {
    super(...arguments);

    this.store = new ForkableStore( { fetch: this.fetch.bind(this) } );
  }


  async fetch() {
    if( this.authSession && this.authSession.info && this.authSession.info.webId ) {
      console.log('Auth session exists, using fetch with auth session');
      return await this.authSession.fetch(...arguments);
    } else {
      console.log('No auth session, using default fetch');

      return await fetch( ...arguments );
    }
  }

  match() { return this.store.match(...arguments); }
  any() { return this.store.any(...arguments); }
  addAll() { return this.store.addAll(...arguments); }
  removeStatements() { return this.store.removeStatements(...arguments); }
  removeMatches() { return this.store.removeMatches(...arguments); }
  parse() { return this.store.parse(...arguments); }
  allGraphs() { return this.store.allGraphs(); }
  serializeDataWithAddAndDelGraph() { return this.store.serializeDataWithAddAndDelGraph(...arguments); }
  async load(source) { return await this.store.load(source); }
  async update(deletes, inserts) { return await this.store.update(deletes, inserts); }
  async persist() { return await this.store.persist(); }
  async persistToTripleStore() { return await this.store.persistToTripleStore(); }
  async loadFromTripleStore (source, body,constructResponseType ) { return await this.store.loadFromTripleStore(source,body, constructResponseType); }
  /**
   *
   * Creates an instance of a model with a specific uri and saves it in the cache
   *
   * @param {String} model Model to create an instance of
   * @param {Object} options Options
   * @param {String} options.uri Uri of the resource
   *
   * @method
   */
  create(model, options = {}) {
    // check the cache
    const peekedInstance = this.peekInstance(model, options.uri);
    if (peekedInstance) return peekedInstance;

    // create a new instance
    const owner = getOwner(this);
    const klass = classForModel(owner, model);
    const createOptions = Object.assign({}, options);
    createOptions.store = this;
    createOptions.modelName = model;
    // console.log(createOptions)
    const instance = new klass(createOptions);
    // If there are now 2 type triples for the instance, remove the default one added by the class constructor.
    // Happens if a non-default rdf-type is set in the options.
    if (this.store.match(instance.uri, RDF('type'), undefined).length > 1) {
      this.removeMatches(instance.uri, RDF('type'), klass.rdfType);
    }
    // console.log(instance);
    setOwner(instance, owner);
    this.storeCacheForModel(model).push(instance);

    // notify listeners
    // console.log(instance)

    for (let listener of this.changeListeners)
      window.setTimeout(() => listener(model, instance), 0);
    return instance;
  }

  /**
   *
   * Returns the cache for a specific model
   *
   * @param {String} model The given model
   *
   * @method
   */
  storeCacheForModel(model) {
    return this.storeCache[model] || (this.storeCache[model] = []);
  }

  /**
   *
   * Search the cache for an instance of a model
   *
   * @param {String} model The model
   * @param {String} uri The uri of the instance
   *
   * @method
   */
  peekInstance(model, uri) {
    if (!uri)
      uri = model;

    const uriValue = uri.value ? uri.value : uri;

    if (model) {
      return this
        .storeCacheForModel(model)
        .find((obj) => obj.uri.value === uriValue);
    } else {
      for (let key in this.storeCache) {
        let matchingInstance =
          this.storeCache[key].find((obj) => obj.uri.value === uriValue);
        if (matchingInstance) return matchingInstance;
      }
      return undefined;
    }
  }

  /**
   *
   * Returns all instances of a model (type)
   *
   * @param {String} model The given model
   * @param {Object} options options
   * @param {String} options.rdfType The RDF type of the instances to return
   *
   * @method
   */
  all(model, options) {
    // TODO: options should have the option to yield a live array.
    // Use a weak map to find which maps to update.
    const klass = classForModel(getOwner(this), model);
    if (!klass.rdfType)
      console.error(`Tried to fetch all instances of ${model} but it has no @rdfType annotation.`);

    let rdfType = klass.rdfType;
    if (options?.rdfType) {
      rdfType = options.rdfType;
    }
    const sourceGraph = this.discoverDefaultGraphByType(klass, rdfType);
    return this
      .match(undefined, RDF("type"), rdfType, sourceGraph)
      .map(({ subject }) => this.create(model, { uri: subject, rdfType }));
  }

  classForModel(model) {
    return classForModel(getOwner(this), model);
  }

  /**
   *
   * Fetches the graph for a specific model (type)
   *
   * @param {String} model The given model
   *
   * @method
   */
  async fetchGraphForType(model) {
    const klass = classForModel(getOwner(this), model);
    if (!klass.rdfType)
      console.error(`Tried to fetch all instances of ${model} but it has no @rdfType annotation.`);
    const sourceGraph = this.discoverDefaultGraphByType(klass);
    if (klass.solid.constructUrl) {
      try{
      await this.loadFromTripleStore(klass.solid.constructUrl,sourceGraph, klass.solid.constructBody);
      } catch (e) {
        console.log(`Failed to fetch ${sourceGraph.value} from tripleStore`);
        console.log(e);
      }
    }
    try {
      await this.load(sourceGraph);
    } catch (e) {
      console.log(`Failed to fetch ${sourceGraph.value}`);
      console.log(e);
    }
  }

  /**
   *
   * Returns the graph of a model (type)
   *
   * @param constructor Constructor of a model
   * @param rdfType
   */
  discoverDefaultGraphByType(constructor, rdfType = constructor.rdfType) {
    let discoveredSolidGraph = null;
    if (constructor.solid?.private)
      discoveredSolidGraph = findTypeRegistrationInGraph(rdfType, this, this.privateTypeIndex);
    else
      discoveredSolidGraph = findTypeRegistrationInGraph(rdfType, this, this.publicTypeIndex);

    // TODO: if a defaultStorageLocation was set, and the type was not
    // found in the type index, write the storage location the correct
    // type index.

    let absoluteGraph;
    if (constructor.solid?.defaultStorageLocation) {
      if (
        constructor.solid.defaultStorageLocation.startsWith('http://') ||
        constructor.solid.defaultStorageLocation.startsWith('https://')
      ) {
        absoluteGraph = namedNode(constructor.solid.defaultStorageLocation);
      } else {
        absoluteGraph = this.podBase && namedNode(`${this.podBase}${constructor.solid.defaultStorageLocation}`);
      }
    }else{
      if(constructor.solid?.graph){
        absoluteGraph = namedNode(constructor.solid.graph);
      }
    }
    if(this.getGraphForType(constructor.modelName)){
      return this.getGraphForType(constructor.modelName);
    }

    return discoveredSolidGraph || absoluteGraph || constructor.defaultGraph;
  }

  graphForType = {}
  setGraphForType(type, graph) {
    this.graphForType[type] = graph;
  }
  getGraphForType(type) {
    return this.graphForType[type];
  }

  autosaveForType = {};
  /**
   *
   * Set whether a type needs to be autosaved or not
   *
   * @param {String} type The type to check
   * @param {Boolean} autosave
   * @method setAutosaveForType
   */
  setAutosaveForType(type, autosave) {
    this.autosaveForType[type] = autosave;
  }

  /**
   *
   * Check if a resource type needs to be autosaved
   *
   * @param {String} type The type to check
   * @method getAutosaveForType
   */
  getAutosaveForType(type) {
    const autosave = this.autosaveForType[type];

    if (autosave !== undefined) {
      return autosave;
    } else {
      return classForModel(getOwner(this), type).autosave;
    }
  }

  addChangeListener(listener) {
    this.changeListeners.add(listener);
  }

  removeChangeListener(listener) {
    this.changeListeners.remove(listener);
  }
}

export function initialize(application) {
  const storeName = `service:${env.rdfStore.name}`;
  application.register(storeName, StoreService, { singleton: true, instantiate: true });

  // application.inject("route", "store", storeName);
  // application.inject("controller", "store", storeName);
}



export default {
  initialize
};
