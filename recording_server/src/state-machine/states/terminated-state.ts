import { StateExecuteResult } from '../types'
import { BaseState } from './base-state'

export class TerminatedState extends BaseState {
    async execute(): StateExecuteResult {
        console.info('Meeting state machine terminated')

        // Cet état est terminal, il ne transite vers aucun autre état
        // Retourner null ou un objet qui indique la fin
        return { nextState: null, context: this.context }
    }
}
