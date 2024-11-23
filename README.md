# A Solid bridge to Ember

Ember-Solid is an ember addon which creates a bridge between ember and solid,
allowing data to be pulled from a solid pod and used in an ember environment.
It is a drop-in replacement for ember-data.

# contents

- [tutorial](#tutorial)
- [how to](#how-to)
- [reference](#reference)
- [discussion](#discussion)

## Compatibility

* Ember.js v3.24 or above
* Ember CLI v3.24 or above
* Node.js v12 or above

## tutorial

A practical example of Ember-Solid.
In this tutorial we will make a simple page which displays authors.
The authors will be pulled from a users solid-pod and displayed using ember.

#### result

#### setting up the environment

Navigate to the directory where you want to set up your project.
In a terminal, enter `ember new tutorial`.
followed by `ember install https://github.com/redpencilio/ember-solid`
and `ember generate ember-solid`

first go into `templates/application.hbs` and change it to this

```html
{{page-title "Tutorial on Ember-Solid"}}
<h1>tutorial</h1>
<LinkTo @route="authors">Authors</LinkTo>
{{outlet}}
```

Now in a terminal type
`ember g route author`

in `routes/author.js` put

```js
import Route from "@ember/routing/route";
import { inject as service } from "@ember/service";

export default class AuthorRoute extends Route {
  @service solidAuth;
  @service store;

  async model() {
    await this.solidAuth.ensureLogin();
    await this.store.fetchGraphForType("author");
    return this.store.all("author");
  }
}

```

And in `templates/author.hbs` write

```html
{{page-title "Authors"}}
<h2>Authors</h2>
<ul>
  {{#each @model as |author|}}
  <li>{{author.givenName}} {{author.familyName}}</li>
  {{/each}}
</ul>
{{outlet}}
```

in a terminal type `ember g model author`
and then in `models/author.js` put

```js
import SemanticModel, {
  solid,
  string,
  integer,
  hasMany,
  belongsTo
} from "ember-solid/models/semantic-model";

@solid({
  defaultStorageLocation: '/private/tests/my-books.ttl', // default location in solid pod
  private: true, // is this private info for the user?
  type: 'http://schema.org/Person', // optional, defining NS is good enough if this is derived from the namespace.
  namespace: 'http://schema.org/', // define a namespace for properties.  http://schema.org/ is a good starting point for finding definitions.  No clue? use 'ext'.
})
export default class Author extends SemanticModel {
  @string()
  givenName;

  @string()
  familyName;


}
```

Now we should be able to log in and see the Authors stored in our solidpod

## how-to

### model a semantic model

```js
import SemanticModel, {
  solid,
  string,
  integer,
  hasMany,
  belongsTo
} from "ember-solid/models/semantic-model";

@solid({
  defaultStorageLocation: '/private/tests/my-books.ttl', // default location in solid pod
  private: true, // is this private info for the user?
  type: 'http://schema.org/Person', // optional, defining NS is good enough if this is derived from the namespace.
  namespace: 'http://schema.org/', // define a namespace for properties.  http://schema.org/ is a good starting point for finding definitions.  No clue? use 'ext'.
})

export default class ourSemanticModel extends SemanticModel {
  @string()
  porperty1;
}
```

### initiate the authentication service

```js
import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class ApplicationRoute extends Route {
  @service solidAuth;

  async beforeModel() {
    await this.solidAuth.ensureLogin();
  }
}

```

### Fetch solid store data

```js
import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class ApplicationRoute extends Route {
  @service solidAuth;
  @service store;

  async model() {
    await this.solidAuth.ensureLogin();
    await this.store.fetchGraphForType("author");
    return this.store.all("author");
  }
}

```

### change the data locally

```js

import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class ApplicationRoute extends Route {
  @service solidAuth;
  @service store;

  async model() {
    await this.solidAuth.ensureLogin();
    await this.store.fetchGraphForType("author");
    return this.store.all("author");
  }

  async afterModel(model) {
    model.forEach((author) => {
      author.givenName = "new name";
    });
    this.router.refresh();
  }
}

```

### delete data locally

  ```js
  import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class ApplicationRoute extends Route {
  @service solidAuth;
  @service store;

  async model() {
    await this.solidAuth.ensureLogin();
    await this.store.fetchGraphForType("author");
    return this.store.all("author");
  }

  async afterModel(model) {
    model.forEach((author) => {
      author.destroy();
    });
    this.router.refresh();
  }
}

```

### update the solid store

```js
import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class ApplicationRoute extends Route {
  @service solidAuth;
  @service store;

  async model() {
    await this.solidAuth.ensureLogin();
    await this.store.fetchGraphForType("author");
    return this.store.all("author");
  }

  async afterModel(model) {
    model.forEach((author) => {
      author.givenName = "new name";
    });
    this.store.persist();
    this.router.refresh();
  }
}

```

## reference

### semantic decorators

#### `@rdfType(typeUri)`

Marks a class as representing a specific RDF type. This decorator assigns an RDF type URI to the class, which is used
when instances of the class are stored or retrieved from the RDF store.

```javascript
@rdfType('http://example.com/Type') class MyModel extends SemanticModel {
  // Class definition
}
```

#### `@defaultGraph(graphUri)`

Specifies the default graph URI for all instances of the class. This is used to determine where in the RDF store the
instances should be placed or retrieved from by default.

```javascript
@defaultGraph('http://example.com/graph') class MyModel extends SemanticModel {
  // Class definition
}
```

#### `@autosave(boolean)`

Enables or disables automatic saving of instances to the RDF store upon changes. When set to `true`, any change to an
instance its properties will automatically trigger an update in the RDF store.

```javascript
@autosave(true) class MyModel extends SemanticModel {
  // Class definition
}
```

#### `@solid(options)`

Configures the solid integration with the class. This decorator can be used to set up a model class for use with Solid
data pods.

```javascript
@solid({
  defaultStorageLocation: '/private/myLocation',
  private: true,
  type: 'http://example.com/Type',
  namespace: 'http://example.com/'
}) class MyModel extends SemanticModel {
  // Class definition
}
```

#### Property Decorators

The file also introduces a set of property decorators, which are used to define the properties of the model classes.
These decorators specify the type of the property, how it relates to RDF predicates, and other options like whether the
property is a relation to another model.

- `@property(options)`: Generic property decorator to define a model property.
- `@string(options)`: Defines a string property.
- `@stringSet(options)`: Defines a property that holds a set of strings.
- `@uri(options)`: Defines a URI property.
- `@decimal(options)`: Defines a decimal property.
- `@integer(options)`: Defines an integer property.
- `@float(options)`: Defines a float property.
- `@boolean(options)`: Defines a boolean property.
- `@dateTime(options)`: Defines a datetime property.
- `@hasMany(options)`: Defines a relation to many instances of another model.
- `@belongsTo(options)`: Defines a relation to a single instance of another model.
- `@term(options)`: Defines a property that holds a term (NamedNode, BlankNode, or Literal).

Each property decorator is used by specifying it above the property definition in the model class, providing options to
configure the property's behavior and how it maps to RDF data.

```javascript
class MyModel extends SemanticModel {
  @string()
  name;

  @hasMany({ model: 'OtherModel', inverse: 'parent' })
  children;
}
```

### rdf-store

The `rdf-store` serves as the primary interface for interacting with Solid storage.
It provides methods to interact with the data from a Solid pod.

#### `create(model, options = {})`

- **Description**: Creates an instance of a model with a specific URI and saves it in the cache. If an instance with the
  same URI already exists in the cache, it returns the existing instance instead of creating a new one.
- **Usage**: `storeService.create('modelName', { uri: 'resourceUri' });`
- **Parameters**:
  - `model` (String): Model to create an instance of.
  - `options` ({uri: String}): Options including the URI of the resource.
- **Returns**: An instance of the model.

#### `storeCacheForModel(model)`

- **Description**: Returns the cache for a specific model. If no cache exists for the model, it initializes an empty
  array for it.
- **Usage**: `storeService.storeCacheForModel('modelName');`
- **Parameters**:
  - `model` (String): The given model.
- **Returns**: An array representing the cache for the specified model.

#### `peekInstance(model, uri)`

- **Description**: Searches the cache for an instance of a model by URI.
- **Usage**: `storeService.peekInstance('modelName', 'resourceUri');`
- **Parameters**:
  - `model` (String): The model.
  - `uri` (String): The URI of the instance.
- **Returns**: The found instance or `undefined` if not found.

#### `all(model, options)`

- **Description**: Returns all instances of a model (type), optionally filtered by RDF type.
- **Usage**: `storeService.all('modelName', { rdfType: 'http://example.com/type' });`
- **Parameters**:
  - `model` (String): The given model.
  - `options` (Object): Options including the RDF type of the instances to return.
- **Returns**: An array of model instances.

#### `classForModel(model)`

- **Description**: Looks up a model class by name.
- **Usage**: `storeService.classForModel('modelName');`
- **Parameters**:
  - `model` (String): Name of the model to lookup.
- **Returns**: The class constructor for the specified model.

#### `fetchGraphForType(model)`

- **Description**: Fetches the graph for a specific model (type) from the Solid pod.
- **Usage**: `await storeService.fetchGraphForType('modelName');`
- **Parameters**:
  - `model` (String): The given model.
- **Returns**: promise that resolves when the graph is fetched.

#### `discoverDefaultGraphByType(constructor, rdfType = constructor.rdfType)`

- **Description**: Determines the default graph for a given model type, based on the model's configuration and the
  store's indexes.
- **Usage**: `storeService.discoverDefaultGraphByType(ModelConstructor);`
- **Parameters**:
  - `constructor` (Function): The constructor function of the model.
  - `rdfType` (NamedNode, optional): The RDF type of the model.
- **Returns**: A `NamedNode` representing the URI of the discovered default graph.

#### `getGraphForType(type)`

- **Description**: Retrieves the graph URI associated with a specific type.
- **Usage**: `storeService.getGraphForType('typeUri');`
- **Parameters**:
  - `type` (String): The type to check.
- **Returns**: The graph URI as a `NamedNode`.

#### `getAutosaveForType(type)`

- **Description**: Checks if a resource type needs to be autosaved.
- **Usage**: `storeService.getAutosaveForType('typeUri');`
- **Parameters**:
  - `type` (String): The type to check.
- **Returns**: A boolean indicating whether the type should be autosaved.

#### `addChangeListener(listener)`

- **Description**: Adds a change listener that will be notified of changes to the store.
- **Usage**: `storeService.addChangeListener(listenerFunction);`
- **Parameters**:
  - `listener` (callback): The function to be called when changes occur.
- **Returns**: void.

#### `removeChangeListener(listener)`

- **Description**: Removes a previously registered change listener.
- **Usage**: `storeService.removeChangeListener(listenerFunction);`
- **Parameters**:
  - `listener` (Function): The listener to remove.
- **Returns**: void.

### solid-Auth

The `solid-Auth` service used to log-in with solid and fetch profile-info and type-inde

#### `restoreSession()`

- **Description**: Attempts to restore a Solid session from a previous login. If a session is already present, it
  returns that session. Otherwise, it tries to handle an incoming redirect from the Solid identity provider, restoring
  the session if one was initiated before. It also sets up the RDF store with the session and pod base information.

- **Usage**:`await authService.restoreSession();`
- **Parameters**: None.

- **Returns**: A `Promise` that resolves to the restored or current session.

#### `ensureLogin()`

- **Description**: Ensures that the user is logged in to their Solid pod. If the user is not logged in, it attempts to
  initiate the login process.
- **Usage**: `await storeService.ensureLogin();`
- **Parameters**: None.
- **Returns**: None. Updates the `authSession` property upon successful login.

#### `ensureLogout()`

- **Description**: Logs out of the current Solid session. This method checks if the user is currently logged in. If so,
  it performs the logout operation and removes the last identity provider from local storage.

- **Usage**:
  `
  await authService.ensureLogout();
  `

- **Parameters**: None.

- **Returns**: A `Promise` that resolves when the logout operation has been completed and the session state has been
  cleared.

#### `ensureTypeIndex()`

- **Description**: Fetches profile-info and the private- and public type indexes and stores them in the RDF store.
- **Usage**:
  `
  await authService.ensureTypeIndex();
  `
- **Parameters**: None.

- **Returns**: A `Promise` that resolves when the type indexes have been loaded into the store.

#### `getPodBase()`

- **Description**: Retrieves the base URL of the user's Solid pod. Gets the pod base of the current user as a Promise.
  Will always end with a trailing slash.
  First, it will look for a pim:storage property on the webId.
  If not, it will look if the current queried resource is a pim:Storage resource, which is then our podBase.
  If not, it will look if the current queried resource is a lpd:BasicContainer resource, which is then our podBase.
  Otherwise, it will traverse upwards and do the same again.
- **Usage**:
  `
  const podBase = await authService.getPodBase(userWebId);
  `
- **Parameters**: None.
  **Returns**: A `Promise` that resolves to a string representing the base URL of the Solid pod, always ending with a
  trailing slash.

#### `initializeSession()`

- **Description**: Initializes the authentication session by checking if there's an existing session with the Solid
  server and setting the `authSession` property accordingly.
- **Usage**: `await storeService.initializeSession();`
- **Parameters**: None.
- **Returns**: None. Updates the `authSession` property of the `StoreService` instance.

## discussion

### Experimental Branch for Triplestore Support

An experimental branch introduces support for using a triplestore alongside Solid Pods.

For more details on the purpose and implementation, please refer to the [discussion section in the experimental branch](https://github.com/redpencilio/ember-solid/tree/experimental/triplestore?tab=readme-ov-file#further-changes-to-make-triplestore-integration-viable).



### Solid

## Contributing

See the [Contributing](CONTRIBUTING.md) guide for details.

## License

This project is licensed under the [MIT License](LICENSE.md).
