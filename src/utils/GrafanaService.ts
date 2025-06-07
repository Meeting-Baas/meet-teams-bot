import { exec } from 'child_process'
import { promisify } from 'util'

const execPromise = promisify(exec)
const NODE_NAME = process.env.NODE_NAME

export class GrafanaService {
    private static instance: GrafanaService | null = null
    private botUuid: string | null = null
    private isUpdated: boolean = false

    private constructor() {}

    public static getInstance(): GrafanaService {
        if (!GrafanaService.instance) {
            GrafanaService.instance = new GrafanaService()
        }
        return GrafanaService.instance
    }

    public setBotUuid(botUuid: string): void {
        this.botUuid = botUuid
    }

    /**
     * Met à jour la configuration de Grafana Agent pour utiliser le botUuid comme identifiant
     */
    public async updateGrafanaAgentWithBotUuid(): Promise<void> {
        // Si déjà mis à jour ou en environnement local, ne rien faire
        if (this.isUpdated || process.env.ENVIRON === 'local') {
            return
        }

        if (!this.botUuid) {
            throw new Error('botUuid must be set before updating Grafana Agent')
        }

        try {
            console.log('Starting Grafana Agent config update...')

            // Mise à jour du fichier de configuration
            const sedResult = await execPromise(
                `sudo -n sed -i 's/${NODE_NAME}/${this.botUuid}/g' /etc/grafana-agent.yaml`,
            )

            if (sedResult.stderr) {
                console.error(
                    `Error while updating the Grafana configuration file: ${sedResult.stderr}`,
                )
            }

            console.log('Grafana configuration file updated successfully')

            // Redémarrage de l'agent Grafana
            const reloadResult = await execPromise(
                'sudo -n systemctl restart grafana-agent.service',
            )

            if (reloadResult.stderr) {
                console.error(
                    `Error while restarting the Grafana agent: ${reloadResult.stderr}`,
                )
            }

            console.log('Grafana agent restarted successfully')

            // Marquer comme mis à jour pour éviter des appels multiples
            this.isUpdated = true
        } catch (error) {
            console.error(`Error updating Grafana Agent: ${error}`)
            throw error
        }
    }
}
