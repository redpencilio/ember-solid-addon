import SemanticModel, { solid, string, integer, hasMany, belongsTo } from 'ember-solid-store/models/semantic-model';

@solid({
  // defaultStorageLocation: "/private/tests/my-books.ttl", // default location in solid pod
  private: true, // is this private info for the user?
  // type: "http://schema.org/<%= classifiedModuleName %>", // optional, defining NS is good enough if this is derived from the namespace.
  ns: "ext" // define a namespace for properties.  http://schema.org/ is a good starting point for finding definitions.  No clue? use 'ext'.
})
export default class <%= classifiedModuleName %> extends SemanticModel {

}
