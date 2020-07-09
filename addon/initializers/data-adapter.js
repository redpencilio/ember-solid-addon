import { get } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import Application from '@ember/application';
import DebugDataAdapter from '@ember/debug/data-adapter';
import SemanticModel from '../models/semantic-model';
import { updateEmberArray } from '../utils/array-helpers';
import env from '../config/environment';

// import { get } from "ember-metal/property_get";
// import run from "ember-metal/run_loop";
// import { dasherize } from "ember-runtime/system/string";
// import Namespace from "ember-runtime/system/namespace";
import EmberObject from "@ember/object";
import { A } from "@ember/array";
import ArrayProxy from '@ember/array/proxy';
// import Application from "ember-application/system/application";

/**
@module ember
@submodule ember-extension-support
*/

/**
  The `DataAdapter` helps a data persistence library
  interface with tools that debug Ember such
  as the [Ember Extension](https://github.com/tildeio/ember-extension)
  for Chrome and Firefox.
  This class will be extended by a persistence library
  which will override some of the methods with
  library-specific code.
  The methods likely to be overridden are:
  * X `getFilters`
  * V `detect`
  * V `columnsForType`
  * V `getModelTypes`
  * V `getRecords`
  * V `getRecordColumnValues`
  * X `getRecordKeywords`
  * X `getRecordFilterValues`
  * X `getRecordColor`
  * X `observeRecord`
  The adapter will need to be registered
  in the application's container as `dataAdapter:main`
  Example:
  ```javascript
  Application.initializer({
    name: "data-adapter",
    initialize: function(container, application) {
      application.register('data-adapter:main', DS.DataAdapter);
    }
  });
  ```
  @class DataAdapter
  @namespace Ember
  @extends EmberObject
*/

const MAX_TABLE_PROPERTIES = 6;

class SemanticDataAdapter extends DebugDataAdapter {
  /**
    The container of the application being debugged.
    This property will be injected
    on creation.
    @property container
    @default null
    @since 1.3.0
  */
  @tracked
  container = null;

  @tracked
  containerDebugAdapter = null;

  @service(env.RSTORE.name) store;

  recordsByTypeInEmberArr = {};

  observersByRecord = {};

  constructor(){
    super(...arguments);

    this.store.addChangeListener( (kind) => {
      this.updateRecordsByType( kind );
    } );
                                  
  }

  /**
    Fetches all models defined in the application.
    @private
    @method getModelTypes
    @return {Array} Array of model types
  */
  getModelTypes() {
    var self = this;
    var containerDebugAdapter = this.get('containerDebugAdapter');
    var types;

    types = containerDebugAdapter.catalogEntriesByType('model');

    // New adapters return strings instead of classes
    types = A(types).map(function(name) {
      return {
        klass: self._nameToClass(name),
        name: name
      };
    });
    types = A(types).filter(function(type) {
      return self.detect(type.klass);
    });

    return A(types);
  }

  detect( klass ) {
    return klass && klass.prototype instanceof SemanticModel; // || klass === SemanticModel;
  }

  getRecords( type ) {
    const typeName =
          this
          .getModelTypes()
          .find( ({ klass }) => klass === type )
          .name;

    this.updateRecordsByType( typeName );
    return this.recordsByTypeInEmberArr[typeName];
  }

  updateRecordsByType( typeName ) {
    const records = this.get('store').storeCacheForModel( typeName );
    const arrProxy = this.recordsByTypeInEmberArr[typeName] || ArrayProxy.create({ content: A() });

    updateEmberArray( arrProxy, records );
    this.recordsByTypeInEmberArr[typeName] = arrProxy;
  }

  /**
    Get the columns for a given model type.
    @public
    @method columnsForType
    @return {Array} An array of columns of the following format:
     name: {String} The name of the column.
     desc: {String} Humanized description (what would show in a table column name).
  */
  columnsForType(type, options) {
    options = options ? options : { limit: true };
    const base = [ { name: "uri", desc: "URI" } ];
    if( type.prototype && type.prototype.attributes ) {
      type.prototype.attributes.forEach( (attr) => base.push( { name: attr, desc: attr } ) );
    }
    if( options.limit ) {
      return base.slice( 0, MAX_TABLE_PROPERTIES );
    } else {
      return base;
    }
  }

  wrapModelType() {
    return super.wrapModelType(...arguments);
  }

  getRecordColumnValues(record) {
    const columns = this.columnsForType(record.constructor, { limit: false });
    
    const columnValues = {};

    columns
      .map( ({name}) => name )
      .forEach( (name) => {
        if( name === "uri" )
          columnValues[name] = get( record, `${name}.value` );
        else
          columnValues[name] = get( record, name );
      } );
    
    return columnValues;
  }

  observeRecord(record, observer) {
    const self = this;
    const observers = this.observersByRecord[record] || [];
    const newObserver = (updatedInstance) => observer(self.wrapRecord( updatedInstance ));
    observers.push( newObserver );
    record.addChangeListener( newObserver );
    return function(){
      for( let oldObserver of self.observersByRecord[record] || [] )
        record.removeChangeListener( oldObserver );
    };
  }
}

export default {
  name: "data-adapter",
  after: "rdf-store",
  initialize( application ) {
    application.register('data-adapter:main', SemanticDataAdapter);
  }
};
