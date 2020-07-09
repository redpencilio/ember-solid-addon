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