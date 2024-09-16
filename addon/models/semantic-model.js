import { tracked } from '@glimmer/tracking';
import { get, set } from '@ember/object';
import { XSD, RDF } from '../utils/namespaces';
import rdflib, { namedNode } from 'rdflib';
import { toNamespace, toNamedNode } from '../utils/namespaces';
import { v4 as uuid } from 'uuid';

const { Statement } = rdflib;

function sendAlert(message) {
  console.error(...arguments); // TODO: these happen too much, fix in ForkingStore
}

/**
 * returns the key for an attribute
 * @param {string} attr The attribute
 *
 */
function cacheKeyForAttr(attr) {
  return `#cache__${attr}`;
}

/**
 *
 * Returns the graph linked to a type
 *
 * @param {String} type The given type
 * @param {StoreService} store The rdf-store to used for querying triples
 */
function graphForType(type, store) {
  return store.discoverDefaultGraphByType(store.classForModel(type));
}

/**
 *
 * Returns the graph where the given entity and property can be found
 *
 * @param {SemanticModel} entity The entity to find the graph for
 * @param {String} propertyName The property name
 */
function graphForInstance(entity, propertyName) {
  const entityGraph = entity.store.getGraphForType(entity.modelName);
  const defaultGraph = entity.defaultGraph;

  if (propertyName) {
    const options = entity.attributeDefinitions[propertyName];
    if (options.model && options.inverse) {
      return graphForType(options.model, entity.store);
    } else {
      return options.graph || entityGraph || defaultGraph;
    }
  } else {
    return entityGraph || defaultGraph;
  }
}

/**
 *
 * Updates an entity in the rdf-store
 *
 * @param {SemanticModel} entity The entity to update
 * @param {[]} del The triples that need to be deleted
 * @param {[]} ins The triples that need to be inserted
 * @param {Object} options Entity options
 */
async function changeGraphTriples(entity, del, ins, options = {}) {
  const validStatement = function(statement) {
    return statement.subject.value !== null && statement.predicate.value !== null && statement.object.value !== null;
  };

  del = del.filter(validStatement);
  ins = ins.filter(validStatement);

  const modelName = options.modelName || entity.modelName;
  const store = options.store || entity.store;
  if (modelName && store.getAutosaveForType(modelName)) {
    // push the data
    await store.update(del, ins);
  }

  // store the data through the graph immediately
  store.addAll(ins);
  store.removeStatements(del);
}

/**
 * Gets all list items from an rdfList from the store.
 *
 * @param {Store} store Contains triples
 * @param {NamedNode} head RDF term of the first cell
 * @param {NamedNode} graph Graph containing cells
 */
function getRdfListCells( head, store, graph ) {
  let nextHead = head;
  let matches = [];

  while( nextHead && !toNamedNode("rdf:nil").equals(nextHead) ) {
    let nextQuad = store.match(nextHead, toNamedNode("rdf:rest"), undefined, graph)[0];
    nextHead = nextQuad.object;
    matches.push(nextQuad);
  }

  return matches;
}

function getRdfListQuads( head, store, graph ) {
  return getRdfListCells( head, store, graph )
    .flatMap( (quad) => store.match(
      quad.subject, undefined, undefined, graph
    ));
}

/**
 * Gets all items from an rdfList from the store.
 *
 * @param {Store} store Contains triples
 * @param {NamedNode} head RDF term of the first cell
 * @param {NamedNode} graph Graph containing cells
 */
function getRdfListObjects( head, store, graph ) {
  return getRdfListCells( head, store, graph )
    .map( (quad) => store.match(
      quad.subject,
      toNamedNode("rdf:first"),
      undefined,
      graph
    )[0].object);
}

/**
 *
 * Returns the object value for a property of an entity
 *
 * @param {SemanticModel} target
 * @param {String} propertyName
 */
function calculatePropertyValue(target, propertyName) {
  let value;
  const options = target.attributeDefinitions[propertyName];
  const predicate = calculatePredicateForProperty(target, propertyName);
  const graph = graphForInstance(target, propertyName);
  const response = options.inverse ? target.store.any(undefined, predicate, target.uri, graph) : target.store.any(target.uri, predicate, undefined, graph);

  const createRelatedRecordOptions = { defaultGraph: options.propagateDefaultGraph ? target.defaultGraph : undefined };

  switch (options.type) {
    case "string":
      value = response && response.value;
      break;
    case "stringSet":
      value =
        target
          .store
          .match(target.uri, predicate, undefined, graph)
          .map(({ object }) => object.value);
      break;
    case "decimal":
      value = response && parseFloat(response.value);
      break;
    case "integer":
      value = response && parseInt(response.value);
      break;
    case "float":
      value = response && parseFloat(response.value);
      break;
    case "boolean":
      if (response === undefined) {
        value = undefined;
      } else {
        const val = response.value;
        value = (val == "true" || val == "1");
      }
      break;
    case "term":
      value = response;
      break;
    case "dateTime":
      value = response && new Date(response.value);
      break;
    case "uri":
      value = response && namedNode(response.value);
      break;
    case "belongsTo":
      value = response && target.store.create(options.model, Object.assign({ uri: response }, createRelatedRecordOptions));
      break;
    case "hasMany":
      var matches;
      if (options.inverse) {
        let sourceGraph = graphForType(options.model, target.store);

        matches =
          target
            .store
            .match(undefined, predicate, target.uri, sourceGraph)
            .map(({ subject }) => subject);
      } else if( options.rdfList ) {
        let listHead = target.store.match(target.uri, predicate, undefined, graph)[0]?.object;
        matches = getRdfListObjects(listHead, target.store, graph);
      } else {
        matches =
          target
            .store
            .match(target.uri, predicate, undefined, graph)
            .map(({ object }) => object);
      }

      value =
        matches
          .map((uri) =>
            target.store.create(options.model, Object.assign( { uri }, createRelatedRecordOptions )));
      break;
    case undefined:
      value = response && response.value;
      break;
  }

  return value;
}

/**
 *
 * Updates the object-value for a property of an entity
 *
 * @param {SemanticModel} entity The entity to update
 * @param {String} propertyName The property for which the value needs to be updated
 */
function updatePropertyValue(entity, propertyName) {
  const cacheKey = cacheKeyForAttr(propertyName);
  const newValue = calculatePropertyValue(entity, propertyName);
  set(entity, cacheKey, newValue);
}

/**
 *
 * Return the predicate-uri of a property
 *
 * @param {SemanticModel} entity
 * @param {String} propertyName
 */
function calculatePredicateForProperty(entity, propertyName) {
  const options = entity.attributeDefinitions[propertyName];
  const predicate = (options.predicate && toNamedNode(options.predicate))
        || (options.ns && toNamespace(options.ns)(propertyName))
        || (entity.defaultNamespace && toNamespace(entity.defaultNamespace)(propertyName))
        || (entity.constructor.namespace && entity.constructor.namespace(propertyName));
  if (!predicate)
    throw "Could not calculate predicate";
  else
    return predicate;
}

/**
 * Creates a set of statements to represent an array as an rdf:List.
 *
 * @param {NamedNode[]} arr List of uris that will be in the list
 * @param {NamedNode} graph Target graph for the quad.
 * @param options
 * @param {boolean} options.noBlankNodes If true, create named nodes for the list.
 * @return {Quad[]} List of quads representing the list, first being the
 * head of the list.
 */
function makeRdfListFromArray(arr, graph, options) {
  // [nn1, nn2, nn3]
  // [Statement(_:1,rdf:first,nn1),Statement(_:1,rdf:rest,_:2),
  //  Statement(_:2,rdf:first,nn2),Statement(_:2,rdf:rest,_:3),
  //  Statement(_:3,rdf:first,nn3),Statement(_:3,rdf:rest,rdf:nil)]
  let listStatements = [];
  let lastListNode = toNamedNode("rdf:nil");

  for( const arrValue of arr.reverse() ) {
    let newListNode = options.noBlankNodes
      ? new rdflib.NamedNode(`http://mu.semte.ch/vocabularies/ext/listNodes/${uuid()}`)
      : rdflib.blankNode();
    listStatements.unshift(
      new Statement(newListNode, toNamedNode("rdf:first"), arrValue, graph)
    );
    listStatements.unshift(
      new Statement(newListNode, toNamedNode("rdf:rest"), lastListNode, graph)
    );
    lastListNode = newListNode;
  }

  return listStatements;
}

/**
 *
 * Defines the setter and getter methods of a property
 *
 * @param {Object} options Options
 */
function property(options = {}) {
  if( options.type === "hasMany" && options.inverse && options.rdfList ) {
    throw `Cannot use hasMany as rdfList with inverse in ${options}`;
  }

  const predicateUri = options.predicate;

  return function(self, propertyName, descriptor) {
    self.attributes = self.attributes ? self.attributes : [];
    self.attributes.push(propertyName);

    const cacheKey = cacheKeyForAttr(propertyName);

    self.attributeDefinitions = self.attributeDefinitions || {};
    self.attributeDefinitions[propertyName] = Object.assign({ cacheKey }, options);

    const calculatePredicate = function(entity) {
      return calculatePredicateForProperty(entity, propertyName);
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
        if (this[cacheKey] !== undefined) {
          return get(this, cacheKey); // register as a dependency
        } else {
          let value = calculatePropertyValue(this, propertyName);
          set(this, cacheKey, value);
          return get(this, cacheKey); // register as a dependency after setting
        }
      },
      set(value) {
        const predicate = calculatePredicate(this);
        const graph = graphForInstance(this, propertyName);
        const setRelationObject = function(object) {
          const del = this.store.match(this.uri, predicate, undefined, graph);
          const ins = object ? [new Statement(this.uri, predicate, object, graph)] : [];
          // console.log(del);
          // console.log(ins);
          changeGraphTriples(this, del, ins)
            .then((uri, message, response) => console.log(`Success updating: ${message}`))
            .catch((message, uri, response) => sendAlert(message, { uri, message, response }));
        }.bind(this);

        let object;
        // TODO: add support for clearing values using undefined or
        // null.
        switch (options.type) {
          case "string":
            setRelationObject(new rdflib.Literal(value));
            break;
          case "stringSet":
            const setDifference = (left,right) => new Set([...left].filter( (l) => !right.has(l) ));

            const newStrings = new Set(value);
            const previousStrings = new Set(this[propertyName] || []);

            const stringsToRemove = setDifference(previousStrings, newStrings);
            const stringsToAdd = setDifference(newStrings, previousStrings);

            changeGraphTriples(
              this,
              [...stringsToRemove].map( (str) => new rdflib.Statement(this.uri, predicate, new rdflib.Literal(str), graph)),
              [...stringsToAdd].map( (str) => new rdflib.Statement(this.uri, predicate, new rdflib.Literal(str), graph)));

            break;
          case "decimal":
            setRelationObject(new rdflib.Literal(value, null, XSD("decimal")));
            break;
          case "integer":
            setRelationObject(new rdflib.Literal(value, null, XSD("integer")));
            break;
          case "float":
            setRelationObject(new rdflib.Literal(value, null, XSD("float")));
            break;
          case "boolean":
            setRelationObject(new rdflib.Literal(value ? "true" : "false", null, XSD("boolean")));
            break;
          case "dateTime":
            setRelationObject(new rdflib.Literal(value.toUTCString(), null, XSD("dateTime")));
            break;
          case "uri":
            setRelationObject(value ? new rdflib.NamedNode(value) : undefined);
            break;
          case "belongsTo":
            const oldValue = this[propertyName];
            setRelationObject(value && value.uri);
            // invalidate inverse relation
            if (options.inverseProperty) {
              oldValue && updatePropertyValue(oldValue, options.inverseProperty);
              value && updatePropertyValue(value, options.inverseProperty);
            }
            break;
          case "hasMany":
            const isNull = value === null || value === undefined;
            value = value || []; // ensure the value is an array, even if
            if (options.rdfList) {
              const store = options.store || this.store;
              let listHead = store.match(
                this.uri,
                predicate,
                undefined,
                graph
              )[0]?.object;
              let statementsToRemove = getRdfListQuads(listHead, store, graph);
              if (listHead) {
                statementsToRemove.push(
                  new Statement(this.uri, predicate, listHead, graph)
                );
              }
              let statementsToAdd = [];
              if (!isNull) {
                statementsToAdd = makeRdfListFromArray(
                  value.map((item) => item.uri),
                  graph,
                  { noBlankNodes: options.noBlankNodes }
                );
                // add reference from our object to the list
                statementsToAdd.push(
                  new Statement(
                    this.uri,
                    predicate,
                    statementsToAdd.length
                      ? statementsToAdd[0].subject
                      : toNamedNode('rdf:nil'),
                    graph
                  )
                );
              }

              changeGraphTriples( this, statementsToRemove, statementsToAdd )
                .then((_uri, message, _response) => console.log(`Success updating: ${message}`))
                .catch((message, uri, response) => sendAlert(message, { uri, message, response })); // TODO: revert property update and recover

              // we don't do inverse relations for lists now, hence there's no invalidation
            } else {
              // null was supplied, this helps
              // consumers further down the line
              const newObjects = new Set(value);
              const oldObjects = new Set(this[propertyName] || []);

              let statementsToRemove = [];
              let statementsToAdd = [];

              if (!oldObjects) {
                // remove all values if we haven't cached them
                // TODO: this case is not supported for now
                console.error("Not removing matches in remote store which might exist");
                this.store.removeMatches(this.uri, predicate, undefined, graph);
              }

              const objectsToAdd = new Set(newObjects);
              oldObjects.forEach((o) => objectsToAdd.delete(o));
              const objectsToRemove = new Set(oldObjects);
              newObjects.forEach((o) => objectsToRemove.delete(o));

              objectsToRemove.forEach((obj) => {
                statementsToRemove.push(new rdflib.Statement(this.uri, predicate, obj.uri, graph));
              });
              objectsToAdd.forEach((obj) => {
                statementsToAdd.push(new rdflib.Statement(this.uri, predicate, obj.uri, graph));
              });

              changeGraphTriples(this, statementsToRemove, statementsToAdd)
                .then((uri, message, response) => console.log(`Success updating: ${message}`))
                .catch((message, uri, response) => sendAlert(message, { uri, message, response })); // TODO: revert property update and recover

              // invalidate inverse relations
              [...objectsToAdd, ...objectsToRemove].forEach((obj) => {
                if (options.inverseProperty) updatePropertyValue(obj, options.inverseProperty);
              });
            }
            break;
          case "term":
            setRelationObject(object);
            break;
        }

        set(this, cacheKey, value); // update dependent key

        // update the change listeners, if any
        for (let listener of this.changeListeners)
          listener(this, { updatedField: propertyName, newValue: value });

        return value;
      }
    };
  };
}

/**
 *
 * Creates a string property
 *
 * @param {Object} options Options
 */
function string(options = {}) {
  options.type = "string";
  return property(options);
}

/**
 * Creates a string-set property, which is a multi-valued string.
 *
 * @param {Object} options Options
 */
function stringSet(options = {}) {
  options.type = "stringSet";
  return property(options);
}


/**
 *
 * Creates a uri property
 *
 * @param {Object} options Options
 */
function uri(options = {}) {
  options.type = "uri";
  return property(options);
}

/**
 *
 * Creates an decimal property
 *
 * @param {Object} options Options
 */
function decimal(options = {}) {
  options.type = "decimal";
  return property(options);
}

/**
 *
 * Creates an integer property
 *
 * @param {Object} options Options
 */
function integer(options = {}) {
  options.type = "integer";
  return property(options);
}

/**
 *
 * Creates a float property
 *
 * @param {Object} options Options
 */
function float(options = {}) {
  options.type = "float";
  return property(options);
}

/**
 *
 * Creates a boolean property
 *
 * @param {Object} options Options
 */
function boolean(options = {}) {
  options.type = "boolean";
  return property(options);
}

/**
 *
 * Creates a datetime property
 *
 * @param {Object} options Options
 */
function dateTime(options = {}) {
  options.type = "dateTime";
  return property(options);
}

/**
 *
 * Creates a term property
 *
 * @param {Object} options Options
 */
function term(options = {}) {
  options.type = "term";
  return property(options);
}

/**
 *
 * Creates a hasMany property
 *
 * @param {Object} options Options
 */
function hasMany(options = {}) {
  options.type = "hasMany";
  console.assert(options.model, "hasMany requires 'model' to be supplied");
  return property(options);
}

/**
 *
 * Creates a belongs-to property
 *
 * @param {Object} options Options
 */
function belongsTo(options = {}) {
  options.type = "belongsTo";
  return property(options);
}

/**
 *
 * Model class that represents entities (resources)
 *
 * @class SemanticModel
 *
 * @property {String} uri The entity Uri
 * @property {String} defaultNameSpace Default namespace of the entity
 * @property {String} modelName The model name
 * @property {Set} changeListeners Called when the model changes
 * @property {StoreService} store The rdf-store used for querying triples
 */
class SemanticModel {
  @tracked uri;
  defaultNamespace = null;

  modelName = null;

  changeListeners = new Set();

  create() {
    console.log(...arguments);
  }

  destroy() {
    this.attributes.forEach((attr) => this[attr] = null);

    changeGraphTriples(
      this,
      [new rdflib.Statement(this.uri, RDF("type"), this.rdfType, graphForInstance(this))],
      [])
      .then((uri, message, response) => console.log(`Success deleting: ${message}`))
      .catch((message, uri, response) => sendAlert(message, { uri, message, response }));
  }

  /**
   * Sets the URI and UUID of the model instance.
   * Also updates all triples in the store that reference this instance.
   *
   * @param {NamedNode} uri
   */
  setUri(uri) {
    const delSubj = this.store.match(
      this.uri,
      undefined,
      undefined,
      graphForInstance(this)
    );
    const delObj = this.store.match(
      undefined,
      undefined,
      this.uri,
      graphForInstance(this)
    );

    this.uri = uri;
    this.uuid =
      uri.value.indexOf('#') > -1
        ? uri.value.split('#')[1]
        : uri.value.split('/').pop();

    const insSubj = [...delSubj].map(
      (st) =>
        new Statement(this.uri, st.predicate, st.object, graphForInstance(this))
    );
    const insObj = [...delObj].map(
      (st) =>
        new Statement(
          st.subject,
          st.predicate,
          this.uri,
          graphForInstance(this)
        )
    );
    changeGraphTriples(this, delSubj.concat(delObj), insSubj.concat(insObj))
      .then((uri, message) => console.log(`Success updating: ${message}`))
      .catch((message, uri, response) =>
        sendAlert(message, { uri, message, response })
      );
  }

  /**
   * Sets the RDF type of the model instance.
   *
   * @param {NamedNode} rdfType
   */
  setRdfType(rdfType) {
    const del = this.store.match(
      this.uri,
      RDF('type'),
      this.rdfType,
      graphForInstance(this)
    );

    this.rdfType = rdfType;

    const ins = [
      new Statement(
        this.uri,
        RDF('type'),
        this.rdfType,
        graphForInstance(this)
      ),
    ];
    changeGraphTriples(this, del, ins)
      .then((uri, message) => console.log(`Success updating: ${message}`))
      .catch((message, uri, response) => sendAlert(message, { uri, message, response }));
  }

  // @service(env.rdfStore.name) store;

  constructor(options = {}) {
    const store = options.store;
    this.store = store;

    if (options.defaultGraph)
      this.defaultGraph = options.defaultGraph;
    else if (this.constructor.defaultGraph)
      this.defaultGraph = this.constructor.defaultGraph;
    else if (this.constructor.solid) {
      this.defaultGraph = options.store.discoverDefaultGraphByType(this.constructor);
    }

    if (options.defaultNamespace)
      this.defaultNamespace = options.defaultNamespace;
    if (options.modelName) {
      this.modelName = options.modelName;
    }

    if (options.uri) {
      this.uri = toNamedNode(options.uri);
      this.uuid = this.uri.value.replace(`${this.defaultGraph.value}#`, '');
    } else {
      this.uuid = this.uuid || options.uuid || uuid();
      this.uri = toNamedNode(`${this.defaultGraph.value}#${this.uuid}`);
    }

    if (this.rdfType || this.constructor.rdfType) {
      this.rdfType = this.rdfType || this.constructor.rdfType;
    }

    ensureResourceExists(this, options);

    // import supplied properties
    const nonPropertyOptions = ["store","defaultGraph","defaultNamespace","modelName","uri"];
    Object
      .keys(options)
      .filter( (k) => !nonPropertyOptions.includes(k) )
      .forEach( (k) => {
          set( this, k, options[k] );
      });
  }

  addChangeListener(listener) {
    this.changeListeners.add(listener);
  }
  removeChangeListener(listener) {
    this.changeListeners.delete(listener);
  }
}

/**
 *
 * Checks if a given resource exists in the local store
 *
 * @param {SemanticModel} entity The given resource
 * @param {Object} options Options
 */
function ensureResourceExists(entity, options) {
  const rdfType = entity.rdfType;
  // We cannot use graphForInstance here because the entity is not fully defined yet.
  const targetGraph = options.store.getGraphForType(entity.modelName) || entity.defaultGraph;

  if (entity.uri && rdfType) {
    const matches =
      options
        .store
        .match(entity.uri, undefined, rdfType, targetGraph)
        .filter(({ predicate }) => predicate.value == RDF("type").value)
        .length;

    if (matches == 0)
      changeGraphTriples(
        this,
        [],
        [new rdflib.Statement(entity.uri, RDF("type"), rdfType, targetGraph)],
        options)
        .then((uri, message, response) => console.log(`Success updating: ${message}`))
        .catch((message, uri, response) => sendAlert(message, { uri, message, response }));
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

function autosave(bool = true) {
  return function(klass) {
    klass.autosave = bool;
  };
}

function solid(options) {
  return function(klass) {
    klass.solid = options;

    if (options.namespace || options.ns) {
      klass.namespace = toNamespace(options.namespace || options.ns);
    }

    if (!options.type && !klass.namespace) {
      console.error('Must specify type for SOLID instances (eg: type: "http://example.com/MyThing") or specify namespace (eg: namespace: "http://example.com/" or namespace: "ext:")');
    } else {
      if( options.type )
        klass.rdfType = toNamedNode(options.type);
      else
        klass.rdfType = klass.namespace(klass.name);
    }
  };
}

export default SemanticModel;
export { property, string, stringSet, uri, decimal, integer, float, boolean, dateTime, hasMany, belongsTo, term, solid };
export { rdfType, defaultGraph, autosave };
