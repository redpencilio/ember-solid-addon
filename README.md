# A Solid bridge to Ember
Ember-Solid is an ember addon which creates a bridge between ember and solid,
allowing data to be pulled from a solid pod and used in an ember environment.
It is a drop-in replacement for ember-data.

# contents
 - [tutorial](#tutorial)
 - [how to](#how-to's)
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

first go into `templates/applications.hbs` and change it to this 
```hbs
{{page-title "Tutorial on Ember-Solid"}}
<h1>tutorial</h1>
<LinkTo @route="authors">Authors</LinkTo>
{{outlet}}
```

Now in a terminal type 
`ember g route authors`

in `routes/authors.js` put
```js
import Route from "@ember/routing/route";
import { inject as service } from "@ember/service";
export default class AuthorsRoute extends Route {
  @service solidAuth;
  @service store;
  async model() {
    await this.solidAuth.ensureLogin();
    await this.store.fetchGraphForType("author");
    return this.store.all("author");
  }
}

```
And in `templates/authors.hbs` write
```hbs
{{page-title "Authors"}}
<h2>Authors</h2>
<ul>
{{#each @model as |author|}}
  <li>{{author.givenName}}  {{author.familyName}}</li>
{{/each}}
</ul>
{{outlet}}
```

in a terminal type `ember g model author`
and then in `models/authors` put
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


## how-to's

## reference

## discussion

### Solid

## Contributing

See the [Contributing](CONTRIBUTING.md) guide for details.


## License

This project is licensed under the [MIT License](LICENSE.md).
