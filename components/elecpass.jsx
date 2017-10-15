import {clipboard} from 'electron';
import path from 'path';

import _ from 'lodash';
import {ButtonGroup, Button, DropdownButton, MenuItem} from 'react-bootstrap';
import {Form, FormGroup, FormControl, ControlLabel, InputGroup} from 'react-bootstrap';
import {Grid, Row, Col, Glyphicon} from 'react-bootstrap';
import {ListGroup, ListGroupItem} from 'react-bootstrap';
import {Modal} from 'react-bootstrap';
import React, {Component} from 'react';

import PassStore from '../pass-store';
import TOTPTokenButton from './totp-token';
import {generatePassword} from '../utils';

export default class ElecpassView extends Component {
  constructor(props) {
    super(props);

    this.state = {
      creating: false,
      currentEntry: null,
      editingEntry: {},
      entries: [],
      newFieldName: '',
      savingEntry: false,
      repoStatus: null,
      setGPGIdModal: false,
      gpgId: ''
    };

    this.passStore = new PassStore();

    this.passStore.loadEntries().then( entries => {
      this.setState({entries});
    });

    this.passStore.on('entry-changed', entry => {
      this.setState({
        entries: _.concat(entry, _.reject(this.state.entries, {name: entry.name}))
      });

      if (this.state.currentEntry && this.state.currentEntry.name == entry.name) {
        this.setState({
          currentEntry: entry
        });
      }
    });

    this.passStore.on('entry-removed', ({name}) => {
      this.setState({
        entries: _.reject(this.state.entries, {name})
      });

      if (this.state.currentEntry && this.state.currentEntry.name == name) {
        this.setState({
          creating: false,
          currentEntry: null
        });
      }
    });

    this.passStore.on('repo-status-changed', repoStatus => {
      this.setState({repoStatus});
    });

    this.passStore.on('require-gpg-id', () => {
      this.setState({
        setGPGIdModal: true
      });
    });

    this.passStore.on('error', err => {
      alert(err.message);
    });
  }

  render() {
    const {repoStatus} = this.state;

    return <Grid fluid={true}>
      <Row className='window-header'>
        <ButtonGroup className='pull-left'>
          <Button bsStyle='success' onClick={this.onInsertEntry.bind(this)}>Insert</Button>
          {repoStatus && repoStatus.isGitRepo && <Button bsStyle='info' onClick={this.onGitPull.bind(this)}>
            Git Pull{repoStatus.behind > 0 ? ` (${repoStatus.behind})` : ''}
          </Button>}
          {repoStatus && repoStatus.isGitRepo && <Button bsStyle='info' onClick={this.onGitPush.bind(this)}>
            Git Push{repoStatus.ahead > 0 ? ` (${repoStatus.ahead})` : ''}
          </Button>}
          {repoStatus && repoStatus.isGitRepo === false && <Button bsStyle='info' onClick={this.onGitInit.bind(this)}>
            Init Git Repo
          </Button>}
        </ButtonGroup>
        <ButtonGroup className='pull-right'>
          {this.state.currentEntry && <Button bsStyle='danger' onClick={this.onRemoveEntry.bind(this)}>Remove</Button>}
        </ButtonGroup>
      </Row>
      <Row className='window-body'>
        <Col xs={6}>
          <ListGroup>
            {_.sortBy(this.state.entries, 'name').map( entry => {
              return <ListGroupItem key={entry.name} onClick={this.onEntrySelected.bind(this, entry)}>
                {entry.name}
              </ListGroupItem>;
            })}
          </ListGroup>
        </Col>
        <Col xs={6}>
          {this.state.currentEntry && <Form>
            <FormGroup>
              <ControlLabel>Entry Name</ControlLabel>
              <FormControl type='text' {...this.linkEntryField('name')}/>
            </FormGroup>

            {this.mapFields('metaInfo', (value, key) => {
              return <FormGroup key={key}>
                <ControlLabel>{key}</ControlLabel>
                <FormControl type='text' {...this.linkEntryField(`metaInfo.${key}`)}/>
              </FormGroup>
            })}

            <FormGroup>
              <ControlLabel>Password 🔓</ControlLabel>
                <InputGroup>
                  <FormControl type='text' {...this.linkEntryField('password')}/>
                  <InputGroup.Button>
                    <Button onClick={this.onCopyToClipboard.bind(this, this.linkEntryField('password').value)}>
                      <Glyphicon glyph='copy' />
                    </Button>
                    <Button onClick={this.onRandomPasswordClicked.bind(this, 'password')}>
                      <Glyphicon glyph='random' />
                    </Button>
                  </InputGroup.Button>
                </InputGroup>
            </FormGroup>

            {this.mapFields('extraInfo', (value, key) => {
              if (key === 'TOTP') {
                return <FormGroup key={key}>
                  <ControlLabel>{key} 🔓</ControlLabel>
                    <InputGroup>
                      <InputGroup.Button>
                        <TOTPTokenButton secret={value} />
                      </InputGroup.Button>
                      <FormControl type='text' {...this.linkEntryField(`extraInfo.${key}`)}/>
                    </InputGroup>
                </FormGroup>;
              } else {
                return <FormGroup key={key}>
                  <ControlLabel>{key} 🔓</ControlLabel>
                  <FormControl type='text' {...this.linkEntryField(`extraInfo.${key}`)}/>
                </FormGroup>;
              }
            })}

            <FormGroup>
              <InputGroup>
                <DropdownButton id='add-field' componentClass={InputGroup.Button} title='Add ...'>
                  <MenuItem onClick={this.onAddFieldClicked.bind(this, true)}>Encrypted Field</MenuItem>
                  <MenuItem onClick={this.onAddFieldClicked.bind(this, false)}>Unencrypted Field</MenuItem>
                  <MenuItem onClick={this.onAddTOTPFieldClicked.bind(this)}>TOTP Field</MenuItem>
                </DropdownButton>
                <FormControl type='text' value={this.state.newFieldName} placeholder='Some feild name'
                  onChange={({target: {value}}) => this.setState({newFieldName: value})} />
              </InputGroup>
            </FormGroup>

            <ButtonGroup>
              <Button bsStyle={_.isEmpty(this.state.editingEntry) ? 'default' : 'primary'}
                disabled={this.state.savingEntry} onClick={this.onSaveClicked.bind(this)}>Save</Button>
            </ButtonGroup>
          </Form>}
        </Col>
      </Row>

      {this.state.setGPGIdModal && <Modal show={true} onHide={() => this.setState({setGPGIdModal: false})}>
        <Modal.Header closeButton>
          <Modal.Title>Set your GPG public key, like `5A804BF5`</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <FormGroup>
              <ControlLabel>GPG Id</ControlLabel>
              <FormControl type='text' onChange={({target: {value}}) => this.setState({gpgId: value})}/>
            </FormGroup>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.onSaveGPGIdClicked.bind(this)}>Save</Button>
        </Modal.Footer>
      </Modal>}
    </Grid>;
  }

  linkEntryField(field) {
    return {
      value: _.get(this.state.editingEntry, field) || _.get(this.state.currentEntry, field) || '',
      onChange: ({target}) => {
        if (!this.state.savingEntry) {
          this.setState(_.set(this.state.editingEntry, field, target.value));
        }
      }
    };
  }

  mapFields(type, fn) {
    return _.map(_.extend({}, this.state.currentEntry[type], this.state.editingEntry[type]), fn);
  }

  onInsertEntry() {
    this.setState({
      creating: true,
      currentEntry: {},
      editingEntry: {}
    });
  }

  onRemoveEntry() {
    this.passStore.removeEntry(this.state.currentEntry).catch(alert);
  }

  onAddFieldClicked(encrypted) {
    if (this.state.newFieldName) {
      const field = encrypted ? 'extraInfo' : 'metaInfo';

      this.setState({
        newFieldName: '',
        editingEntry: _.extend(this.state.editingEntry, {
          [field]: _.extend(this.state.editingEntry[field], {
            [this.state.newFieldName]: ''
          })
        })
      });
    }
  }

  onAddTOTPFieldClicked() {
    if (!this.state.editingEntry.TOTP) {
      this.setState({
        editingEntry: _.extend(this.state.editingEntry, {
          extraInfo: _.extend(this.state.editingEntry.extraInfo, {
            TOTP: ''
          })
        })
      });
    }
  }

  onCopyToClipboard(text) {
    clipboard.writeText(text);
  }

  onRandomPasswordClicked(field) {
    this.setState(_.set(this.state.editingEntry, field, generatePassword()));
  }

  onSaveClicked() {
    this.setState({savingEntry: true});

    this.passStore.encryptAndWriteEntry(_.extend({}, this.state.currentEntry, this.state.editingEntry)).then( () => {
      this.setState({
        savingEntry: false,
        creating: false,
        editingEntry: {}
      });
    }).catch(alert);
  }

  onEntrySelected(entry) {
    this.setState({currentEntry: entry});

    this.passStore.decryptEntry(entry).then( decrypted => {
      this.setState({
        creating: false,
        currentEntry: _.extend(decrypted, entry),
        editingEntry: {}
      });
    }).catch(alert);
  }

  onSaveGPGIdClicked() {
    this.passStore.gpgAdapter.setGPGId(this.state.gpgId).then( () => {
      this.setState({setGPGIdModal: false});
    }).catch(alert);
  }

  onGitInit() {
    this.passStore.gitAdapter.initRepo().then( () => {
      return this.passStore.loadRepoStatus();
    }).catch(alert);
  }

  onGitPull() {
    this.passStore.gitAdapter.pullRemote().then( () => {
      this.passStore.loadEntries().then( entries => {
        this.setState({entries});
      });
    }).catch(alert);
  }

  onGitPush() {
    this.passStore.gitAdapter.pushRemote().catch(alert);
  }
}
