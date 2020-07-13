import { get } from '@ember/object';
import { inject as service } from '@ember/service';
import Component from '@glimmer/component';
import { getOwner } from '@ember/application';


export default class SolidAutoLoginComponent extends Component {
  @service auth;

  constructor(){
    super(...arguments);
    this.initializeLoginAndAuth();
  }

  async initializeLoginAndAuth(){
    await this.auth.ensureLogin();
    await this.auth.ensureTypeIndex();
  }
}
