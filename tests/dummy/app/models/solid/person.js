import { VCARD, FOAF, LDP, SP, SOLID } from 'solid-addon/utils/namespaces';
import SemanticModel, { property, string, integer, term, solid, rdfType } from 'solid-addon/models/semantic-model';

@solid({
  defaultStorageLocation: "/profile/card.ttl",
  private: false
})

@rdfType(FOAF("Person"))
export default class SolidPersonModel extends SemanticModel {
    defaultNamespace = VCARD;
  
    @string( { ns: FOAF } )
    name = "";
  
    @string( { predicate: VCARD("fn") } )
    formattedName = "";
  
    @string( { predicate: VCARD("organization-name") } )
    organizationName = "";
  
    @term( { ns: LDP } )
    inbox = null;
  
    // @term( { ns: SP } )
    // preferencesFile = null;
  
    @term( { ns: SP } )
    storage = null;
  
    @term( { ns: SOLID } )
    account = null;
  
    @term( { ns: SOLID } )
    privateTypeIndex = null;
  
    @term( { ns: SOLID } )
    publicTypeIndex = null;
  
  }