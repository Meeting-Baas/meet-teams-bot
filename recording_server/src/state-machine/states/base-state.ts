import { Page } from '@playwright/test'
import { listenPage } from '../../browser/page-logger'
import { MeetingContext, MeetingStateType, StateExecuteResult } from '../types'

export abstract class BaseState {
    protected context: MeetingContext
    protected stateType: MeetingStateType

    constructor(context: MeetingContext, stateType: MeetingStateType) {
        this.context = context
        this.stateType = stateType

        this.setupPageLoggers()
    }

    private setupPageLoggers(): void {
        if (this.context.playwrightPage) {
            listenPage(this.context.playwrightPage)
            console.info(
                `Setup logger for main page in state ${this.stateType}`,
            )
        }

        if (this.context.backgroundPage) {
            // listenPage(this.context.backgroundPage);
            console.info(
                `Setup logger for background page in state ${this.stateType}`,
            )
        }
    }

    protected async setupNewPage(page: Page, pageName: string): Promise<void> {
        listenPage(page)
        console.info(`Setup logger for new page: ${pageName}`)
    }

    abstract execute(): StateExecuteResult

    protected transition(nextState: MeetingStateType): StateExecuteResult {
        return Promise.resolve({
            nextState,
            context: this.context,
        })
    }

    protected async handleError(error: Error): StateExecuteResult {
        console.error(`Error in state ${this.stateType}:`, error)
        this.context.error = error
        this.context.errorTime = Date.now()
        return this.transition(MeetingStateType.Error)
    }

    /**
     * Démarre un observateur qui surveille l'apparition des dialogues comme "Got it" 
     * et les gère automatiquement en arrière-plan
     */
    protected startDialogObserver() {
        // Utiliser l'observateur global au lieu de créer une instance locale
        if (this.context.startGlobalDialogObserver) {
            this.context.startGlobalDialogObserver();
            console.info(`Requested global dialog observer from state ${this.constructor.name}`);
        } else {
            console.warn(`Global dialog observer not available in state ${this.constructor.name}`);
        }
    }

    /**
     * Arrête l'observateur de dialogue
     */
    protected stopDialogObserver() {
        // Cette méthode est gardée pour compatibilité, mais ne fait plus rien
        // L'observateur global sera arrêté au niveau de la machine à états
        console.info(`Dialog observer stop requested from state ${this.constructor.name} (ignored - using global observer)`);
    }
}
