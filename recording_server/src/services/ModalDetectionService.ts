import type { Page } from '@playwright/test'
import { MEETING_CONSTANTS } from '../state-machine/constants'

export interface ModalDetectionResult {
    found: boolean
    dismissed: boolean
    modalType: string | null
    detectionMethod?: string
    language?: string
}

/**
 * Language patterns for modal detection and button text
 */
class LanguagePatterns {
    static readonly BUTTON_TEXTS = {
        english: [
            'Got it', 'OK', 'Dismiss', 'Close', 'Continue', 'Accept', 'Understood', 
            'Cancel', 'Join', 'Join now', 'Decline', 'Skip', 'Not now', 'Later', 'Maybe later',
            'Leave', 'Stay', 'Remain', 'Exit', 'Okay', 'Ok', 'Alright', 'Sure', 'Yes', 'No', 
            'Done', 'Finish', '×', '✕', 'X'
        ],
        french: [
            'Compris', 'Fermer', 'Continuer', 'Accepter', 'D\'accord', 'Annuler', 'Participer', 
            'Rejoindre', 'Refuser', 'Ignorer', 'Plus tard', 'Quitter', 'Partir', 'Rester', 'Maintenant'
        ],
        spanish: [
            'Entendido', 'Vale', 'De acuerdo', 'Aceptar', 'Cerrar', 'Continuar', 'Salir', 'Quedarse',
            'Cancelar', 'Unirse', 'Unirse ahora', 'Rechazar', 'Omitir', 'Ahora no', 'Más tarde',
            'Participar', 'Entrar', 'Permitir', 'Autorizar', 'Finalizar', 'Terminar'
        ],
        japanese: [
            'わかりました', 'OK', 'オーケー', '了解', '理解しました', '閉じる', '続行', '受け入れる', '同意する',
            'キャンセル', '参加', '今すぐ参加', '辞退', 'スキップ', '後で', 'もう少し後で',
            '退出', '残る', '許可', '承認', '完了', '終了', 'はい', 'いいえ'
        ],
        chinese_simplified: [
            '明白了', '好的', 'OK', '确定', '了解', '关闭', '继续', '接受', '同意',
            '取消', '加入', '立即加入', '拒绝', '跳过', '稍后', '以后再说',
            '离开', '留下', '允许', '批准', '完成', '结束', '是', '否'
        ],
        chinese_traditional: [
            '明白了', '好的', 'OK', '確定', '了解', '關閉', '繼續', '接受', '同意',
            '取消', '加入', '立即加入', '拒絕', '跳過', '稍後', '以後再說',
            '離開', '留下', '允許', '批准', '完成', '結束', '是', '否'
        ],
        german: ['Verstanden', 'OK', 'Schließen', 'Weiter', 'Verlassen', 'Bleiben'],
        portuguese: ['Entendi', 'OK', 'Fechar', 'Continuar', 'Sair', 'Ficar'],
        italian: ['Capito', 'OK', 'Chiudi', 'Continua', 'Esci', 'Rimani'],
        dutch: ['Begrepen', 'OK', 'Sluiten', 'Doorgaan', 'Verlaten', 'Blijven']
    }

    static readonly BREAKOUT_INVITATIONS = {
        english: ['invited to join', 'join the breakout', 'participate in breakout', 'breakout session', 'small group session', 'group discussion'],
        french: ['invité à rejoindre', 'rejoindre le groupe', 'session en petit groupe', 'groupe de travail', 'invitation de groupe'],
        spanish: ['invitado a unirse', 'unirse al grupo', 'sesión de grupo pequeño', 'grupo de trabajo', 'invitación de grupo'],
        japanese: ['グループに参加', '招待されています', 'ブレイクアウトセッション', '小グループセッション'],
        chinese_simplified: ['邀请加入', '参加分组', '小组讨论邀请', '分组会话邀请'],
        chinese_traditional: ['邀請加入', '參加分組', '小組討論邀請', '分組會話邀請'],
        german: ['eingeladen beizutreten', 'an der gruppe teilnehmen', 'gruppensitzung'],
        portuguese: ['convidado para participar', 'juntar-se ao grupo', 'sessão de grupo'],
        italian: ['invitato a partecipare', 'unirsi al gruppo', 'sessione di gruppo'],
        dutch: ['uitgenodigd om deel te nemen', 'deelnemen aan groep', 'groepssessie']
    }

    static readonly BREAKOUT_NOTIFICATIONS = {
        english: ['back in the main room', 'breakout room has closed', 'moved to the main room', 'returned to main room', 'breakout session ended'],
        french: ['de retour dans la salle principale', 'salle de groupe fermée', 'déplacé vers la salle principale', 'session terminée'],
        spanish: ['de vuelta en la sala principal', 'sala de grupos cerrada', 'movido a la sala principal', 'sesión terminada'],
        japanese: ['メインルームに戻りました', 'ブレイクアウトルームが閉じられました', 'メインルームに移動しました', 'セッションが終了しました'],
        chinese_simplified: ['回到主会议室', '分组讨论室已关闭', '已移至主会议室', '会话已结束'],
        chinese_traditional: ['回到主會議室', '分組討論室已關閉', '已移至主會議室', '會話已結束']
    }

    static readonly RECORDING_INDICATORS = {
        english: ['being recorded', 'recording', 'record this call', 'gemini is taking notes', 'call is recorded', 'meeting is recorded'],
        french: ['enregistré', 'enregistrement', 'enregistrer', 'gemini prend des notes', 'appel est enregistré'],
        spanish: ['siendo grabado', 'grabación', 'grabar', 'llamada grabada', 'reunión grabada', 'gemini está tomando notas'],
        japanese: ['録画中', '録画されています', '録画', '記録中', 'Geminiがメモを取っています', '通話が録画されています'],
        chinese_simplified: ['正在录制', '录制', '录像', '通话录制', '会议录制', 'Gemini正在记录'],
        chinese_traditional: ['正在錄製', '錄製', '錄像', '通話錄製', '會議錄製', 'Gemini正在記錄'],
        german: ['aufgezeichnet', 'aufzeichnung', 'aufnehmen', 'anruf wird aufgezeichnet'],
        portuguese: ['sendo gravado', 'gravação', 'gravar', 'chamada gravada'],
        italian: ['registrato', 'registrazione', 'registrare', 'chiamata registrata'],
        dutch: ['opgenomen', 'opname', 'opnemen', 'gesprek wordt opgenomen']
    }

    static getAllButtonTexts(): string[] {
        return Object.values(this.BUTTON_TEXTS).flat()
    }

    static detectLanguage(text: string): string {
        const lowerText = text.toLowerCase()
        
        for (const [language, patterns] of Object.entries(this.BUTTON_TEXTS)) {
            if (patterns.some(pattern => lowerText.includes(pattern.toLowerCase()))) {
                return language
            }
        }
        
        return 'english'
    }

    static containsPatterns(text: string, patterns: Record<string, string[]>): boolean {
        const lowerText = text.toLowerCase()
        return Object.values(patterns).flat().some(pattern => 
            lowerText.includes(pattern.toLowerCase())
        )
    }
}

/**
 * Utility class for modal operations
 */
class ModalUtils {
    static readonly MODAL_SELECTORS = [
        '[role="alertdialog"][aria-modal="true"]',
        '[role="dialog"][aria-modal="true"]', 
        'dialog[open]',
        '.VfPpkd-cnG4Wd'
    ]

    static async logModalText(modal: any, prefix: string, maxLength: number = 200): Promise<void> {
        try {
            const modalText = await modal.textContent() || ''
            const cleanText = modalText.trim().replace(/\s+/g, ' ').substring(0, maxLength)
            console.log(`[ModalDetection] ${prefix}: "${cleanText}${modalText.length > maxLength ? '...' : ''}"`)
        } catch (error) {
            console.warn(`[ModalDetection] Could not log modal text for ${prefix}`)
        }
    }

    static async getModalElements(page: Page): Promise<any[]> {
        return await page.locator(this.MODAL_SELECTORS.join(', ')).all()
    }

    static async tryClickButtonWithText(page: Page, modal: any, buttonText: string): Promise<ModalDetectionResult> {
        try {
            const selectors = [
                `button:has-text("${buttonText}")`,
                `[role="button"]:has-text("${buttonText}")`,
                `button [aria-hidden="true"]:has-text("${buttonText}")`,
                `button span:has-text("${buttonText}")`,
                `[aria-label*="${buttonText}"]`
            ]

            for (const selector of selectors) {
                try {
                    const button = await modal.locator(selector).first()
                    if (await button.isVisible()) {
                        await button.click()
                        await page.waitForTimeout(500)
                        return { found: true, dismissed: true, modalType: 'button_click', detectionMethod: `text_${buttonText}` }
                    }
                } catch (error) {
                    continue
                }
            }

            return { found: false, dismissed: false, modalType: null }
        } catch (error) {
            return { found: false, dismissed: false, modalType: null }
        }
    }
}

/**
 * Ultra-resilient service for detecting and handling blocking modals in Google Meet
 * Supports multiple languages, detection methods, and fallback strategies
 */
export class ModalDetectionService {
    private static instance: ModalDetectionService | null = null

    private constructor() {}

    static getInstance(): ModalDetectionService {
        if (!ModalDetectionService.instance) {
            ModalDetectionService.instance = new ModalDetectionService()
        }
        return ModalDetectionService.instance
    }

    /**
     * Multi-language button text patterns
     */
    private getButtonTextPatterns(): string[] {
        return LanguagePatterns.getAllButtonTexts()
    }

    /**
     * Enhanced modal detection with multiple strategies prioritizing resilience
     */
    async checkAndDismissModals(page: Page): Promise<ModalDetectionResult> {
        try {
            console.log('[ModalDetection] Starting modal detection sweep...')
            
            // Try detection methods in order of reliability
            const detectionMethods = [
                () => this.detectSemanticModals(page),
                () => this.detectBehavioralModals(page),
                () => this.detectContentBasedModals(page), 
                () => this.detectStructuralModals(page),
                () => this.detectCssClassModals(page),
                () => this.detectGoogleMeetModals(page)
            ]

            for (const detectMethod of detectionMethods) {
                const result = await detectMethod()
                if (result.found) {
                    console.log(`[ModalDetection] Found modal via ${result.detectionMethod}: ${result.modalType}`)
                    
                    // Log modal text content for debugging
                    const modals = await ModalUtils.getModalElements(page)
                    if (modals.length > 0) {
                        await ModalUtils.logModalText(modals[0], 'Modal text', 300)
                    }
                    
                    // Special handling for different modal types
                    if (modals.length > 0) {
                        // Check for breakout room notification first
                        const notificationResult = await this.handleSpecialModal(page, modals[0], 'breakout_notification')
                        if (notificationResult.found) return notificationResult
                        
                        // Check for breakout room invitation
                        const breakoutResult = await this.handleSpecialModal(page, modals[0], 'breakout_invitation')
                        if (breakoutResult.found) return breakoutResult
                        
                        // Check for recording consent
                        const recordingResult = await this.handleSpecialModal(page, modals[0], 'recording_consent')
                        if (recordingResult.found) return recordingResult
                    }
                    
                    if (result.dismissed) {
                        console.log(`[ModalDetection] Successfully dismissed modal: ${result.modalType}`)
                        return result
                    } else {
                        console.log(`[ModalDetection] Modal found but not dismissed: ${result.modalType}`)
                        return result
                    }
                }
            }

            return { found: false, dismissed: false, modalType: null }
        } catch (error) {
            console.error('[ModalDetection] Error during modal detection:', error)
            return { found: false, dismissed: false, modalType: 'detection_error' }
        }
    }

    /**
     * Unified special modal handler
     */
    private async handleSpecialModal(page: Page, modal: any, modalType: 'breakout_notification' | 'breakout_invitation' | 'recording_consent'): Promise<ModalDetectionResult> {
        try {
            const modalText = await modal.textContent() || ''
            
            switch (modalType) {
                case 'breakout_notification':
                    if (LanguagePatterns.containsPatterns(modalText, LanguagePatterns.BREAKOUT_NOTIFICATIONS)) {
                        await ModalUtils.logModalText(modal, 'Breakout notification modal text', 200)
                        return await this.dismissWithPatterns(page, modal, LanguagePatterns.BUTTON_TEXTS, 'breakout_room_notification_dismissed')
                    }
                    break
                
                case 'breakout_invitation':
                    if (LanguagePatterns.containsPatterns(modalText, LanguagePatterns.BREAKOUT_INVITATIONS)) {
                        await ModalUtils.logModalText(modal, 'Breakout room modal text', 200)
                        const behavior = MEETING_CONSTANTS.BREAKOUT_ROOM_BEHAVIOR
                        if (behavior === 'ignore') {
                            return { found: true, dismissed: false, modalType: 'breakout_room_ignored', detectionMethod: 'breakout_room_handler' }
                        }
                        const patterns = behavior === 'join' ? this.getJoinPatterns() : this.getDeclinePatterns()
                        return await this.dismissWithPatterns(page, modal, patterns, `breakout_room_${behavior}d`)
                    }
                    break
                
                case 'recording_consent':
                    if (LanguagePatterns.containsPatterns(modalText, LanguagePatterns.RECORDING_INDICATORS)) {
                        await ModalUtils.logModalText(modal, 'Recording consent modal text', 200)
                        const behavior = MEETING_CONSTANTS.RECORDING_CONSENT_BEHAVIOR
                        if (behavior === 'ignore') {
                            return { found: true, dismissed: false, modalType: 'recording_consent_ignored', detectionMethod: 'recording_consent_handler' }
                        }
                        const patterns = behavior === 'accept' ? this.getAcceptPatterns() : this.getDeclinePatterns()
                        return await this.dismissWithPatterns(page, modal, patterns, `recording_consent_${behavior}ed`)
                    }
                    break
            }
            
            return { found: false, dismissed: false, modalType: null }
        } catch (error) {
            console.warn(`[ModalDetection] Error handling ${modalType} modal:`, error)
            return { found: false, dismissed: false, modalType: null }
        }
    }

    /**
     * Dismiss modal using pattern arrays
     */
    private async dismissWithPatterns(page: Page, modal: any, patterns: Record<string, string[]> | string[], modalType: string): Promise<ModalDetectionResult> {
        const flatPatterns = Array.isArray(patterns) ? patterns : Object.values(patterns).flat()
        
        for (const pattern of flatPatterns) {
            const result = await ModalUtils.tryClickButtonWithText(page, modal, pattern)
            if (result.dismissed) {
                console.log(`[ModalDetection] Dismissed ${modalType} via "${pattern}" button`)
                return {
                    found: true,
                    dismissed: true,
                    modalType: modalType,
                    detectionMethod: 'pattern_based',
                    language: LanguagePatterns.detectLanguage(pattern)
                }
            }
        }
        
        return { found: true, dismissed: false, modalType: modalType + '_failed' }
    }

    /**
     * Get join patterns for breakout rooms and recording
     */
    private getJoinPatterns(): Record<string, string[]> {
        return {
            english: ['Join', 'Join now', 'Accept', 'Continue', 'Proceed', 'Allow', 'Agree'],
            french: ['Participer', 'Rejoindre maintenant', 'Accepter', 'Continuer', 'Autoriser'],
            spanish: ['Unirse ahora', 'Unirse', 'Aceptar', 'Continuar', 'Permitir', 'Entrar', 'Participar'],
            japanese: ['今すぐ参加', '参加', '受け入れる', '続行', '許可', '同意する'],
            chinese_simplified: ['立即加入', '加入', '接受', '继续', '允许', '同意'],
            chinese_traditional: ['立即加入', '加入', '接受', '繼續', '允許', '同意'],
            german: ['Jetzt beitreten', 'Beitreten', 'Akzeptieren', 'Weiter', 'Erlauben'],
            portuguese: ['Participar agora', 'Participar', 'Aceitar', 'Continuar', 'Permitir'],
            italian: ['Partecipa ora', 'Partecipa', 'Accetta', 'Continua', 'Consenti'],
            dutch: ['Nu deelnemen', 'Deelnemen', 'Accepteren', 'Doorgaan', 'Toestaan']
        }
    }

    /**
     * Get accept patterns for recording consent
     */
    private getAcceptPatterns(): Record<string, string[]> {
        return this.getJoinPatterns() // Same patterns for accepting
    }

    /**
     * Get decline patterns
     */
    private getDeclinePatterns(): Record<string, string[]> {
        return {
            english: ['Cancel', 'Decline', 'Exit', 'No thanks', 'Leave', 'Not now'],
            french: ['Quitter', 'Refuser', 'Sortir', 'Non merci', 'Annuler'],
            spanish: ['Salir', 'Rechazar', 'No gracias', 'Cancelar', 'No participar', 'Ahora no'],
            japanese: ['退出', '辞退', '拒否', 'いいえ', 'キャンセル', '参加しない'],
            chinese_simplified: ['离开', '拒绝', '退出', '取消', '不同意', '不参加'],
            chinese_traditional: ['離開', '拒絕', '退出', '取消', '不同意', '不參加'],
            german: ['Verlassen', 'Ablehnen', 'Nein danke', 'Abbrechen'],
            portuguese: ['Sair', 'Recusar', 'Não obrigado', 'Cancelar'],
            italian: ['Esci', 'Rifiuta', 'No grazie', 'Annulla'],
            dutch: ['Verlaten', 'Weigeren', 'Nee bedankt', 'Annuleren']
        }
    }

    /**
     * Strategy 1: Semantic/ARIA detection (most stable - rarely changes)
     */
    private async detectSemanticModals(page: Page): Promise<ModalDetectionResult> {
        const ariaPatterns = [
            {
                name: 'aria_dialog_modal',
                selector: '[role="dialog"][aria-modal="true"]',
                method: 'semantic_aria'
            },
            {
                name: 'aria_alertdialog_modal', 
                selector: '[role="alertdialog"]',
                method: 'semantic_aria'
            },
            {
                name: 'modal_attribute_any',
                selector: '[aria-modal="true"]',
                method: 'semantic_aria'
            },
            {
                name: 'dialog_element',
                selector: 'dialog[open]',
                method: 'semantic_html'
            }
        ]

        return await this.tryPatternsWithSmartButtonSearch(page, ariaPatterns)
    }

    /**
     * Strategy 2: Behavioral detection (structure + interaction patterns)
     */
    private async detectBehavioralModals(page: Page): Promise<ModalDetectionResult> {
        const behavioralPatterns = [
            {
                name: 'overlay_with_dismiss_button',
                selector: 'div[style*="position: fixed"]:has(button), div[style*="z-index"]:has(button)',
                method: 'behavioral_overlay'
            },
            {
                name: 'modal_with_backdrop',
                selector: 'div:has(+ div[style*="background"]):has(button)',
                method: 'behavioral_backdrop'
            },
            {
                name: 'centered_card_with_button',
                selector: 'div[style*="position: absolute"]:has(img):has(h1, h2, h3):has(button)',
                method: 'behavioral_centered'
            },
            {
                name: 'popup_notification',
                selector: 'div:visible:has(button):has(h1, h2, h3, p)',
                method: 'behavioral_notification'
            }
        ]

        return await this.tryPatternsWithSmartButtonSearch(page, behavioralPatterns)
    }

    /**
     * Strategy 3: Content-based detection with behavioral triggers
     */
    private async detectContentBasedModals(page: Page): Promise<ModalDetectionResult> {
        const contentPatterns = [
            // Video privacy patterns (multi-language)
            {
                name: 'video_privacy_modal',
                selector: 'div:has-text("video differently"), div:has-text("vidéo différemment"), div:has-text("vídeo diferente")',
                method: 'content_video_privacy'
            },
            // Camera/microphone permission patterns
            {
                name: 'camera_permission_modal',
                selector: 'div:has-text("camera"), div:has-text("caméra"), div:has-text("cámara"), div:has-text("microfone"), div:has-text("microphone")',
                method: 'content_permissions'
            },
            // Background/feed related content
            {
                name: 'background_feed_modal',
                selector: 'div:has-text("background"), div:has-text("arrière-plan"), div:has-text("fundo"), div:has-text("feed")',
                method: 'content_background'
            },
            // Generic privacy/notification content
            {
                name: 'privacy_notification_modal',
                selector: 'div:has-text("Others may see"), div:has-text("Les autres"), div:has-text("Otros pueden ver")',
                method: 'content_privacy'
            }
        ]

        // Only consider content patterns that also have dismiss mechanisms
        const enhancedPatterns = contentPatterns.map(pattern => ({
            ...pattern,
            selector: `${pattern.selector}:has(button), ${pattern.selector} + div:has(button), ${pattern.selector} ~ div:has(button)`
        }))

        return await this.tryPatternsWithSmartButtonSearch(page, enhancedPatterns)
    }

    /**
     * Strategy 4: Structural pattern detection
     */
    private async detectStructuralModals(page: Page): Promise<ModalDetectionResult> {
        const patterns = [
            // Modal with header image and text content
            {
                name: 'image_text_modal',
                selector: 'div:has(img):has(h1, h2, h3):has(button)',
                method: 'structural'
            },
            // Modal with specific text patterns about video/camera
            {
                name: 'camera_privacy_modal',
                selector: 'div:has-text("vidéo"):has(button), div:has-text("video"):has(button), div:has-text("camera"):has(button)',
                method: 'structural'
            },
            // Modal with background/feed related content
            {
                name: 'background_feed_modal',
                selector: 'div:has-text("arrière-plan"):has(button), div:has-text("background"):has(button), div:has-text("feed"):has(button)',
                method: 'structural'
            }
        ]

        return await this.tryPatternsWithSmartButtonSearch(page, patterns)
    }

    /**
     * Strategy 5: CSS classes (fallback - fragile but specific)
     * Moved to last resort since these are most likely to break
     */
    private async detectCssClassModals(page: Page): Promise<ModalDetectionResult> {
        // Keep the existing CSS class logic but as fallback
        return await this.detectGoogleMeetModals(page)
    }

    /**
     * Legacy Google Meet detection (for backward compatibility)
     */
    private async detectGoogleMeetModals(page: Page): Promise<ModalDetectionResult> {
        const strategies = [
            {
                name: 'google_meet_dialog_container',
                selector: '.VfPpkd-cnG4Wd',
                buttonSelector: '.VfPpkd-LgbsSe',
                searchScope: 'parent',
                method: 'css_class_google'
            },
            {
                name: 'google_material_scrim',
                selector: '.VfPpkd-Sx9Kwc[data-disable-scrim-click-to-close="true"]',
                buttonSelector: 'button[data-mdc-dialog-action]',
                searchScope: 'inside',
                method: 'css_class_material'
            },
            {
                name: 'google_meet_image_modal',
                selector: '.UiiWrc:has(img.ErZVx)',
                buttonSelector: 'button[data-mdc-dialog-button-default]',
                searchScope: 'parent',
                method: 'css_class_image'
            }
        ]

        for (const strategy of strategies) {
            try {
                const modal = page.locator(strategy.selector)
                const isVisible = await modal.isVisible({ timeout: 300 })
                
                if (isVisible) {
                    console.info(`[ModalDetection] Found Google Meet modal: ${strategy.name}`)
                    
                    // Determine search scope for buttons
                    let buttonSearchScope: any = modal
                    if (strategy.searchScope === 'parent') {
                        try {
                            const parent = modal.locator('..')
                            const parentVisible = await parent.isVisible({ timeout: 200 })
                            if (parentVisible) {
                                buttonSearchScope = parent
                            } else {
                                buttonSearchScope = page
                            }
                        } catch (error) {
                            buttonSearchScope = page
                        }
                    }
                    
                    // Try universal button search
                    const result = await this.dismissWithUniversalButtonSearch(page, buttonSearchScope, strategy.name, 'css_legacy')
                    if (result.dismissed) return result
                    
                    return {
                        found: true,
                        dismissed: false,
                        modalType: strategy.name,
                        detectionMethod: strategy.method
                    }
                }
            } catch (error) {
                continue
            }
        }

        return { found: false, dismissed: false, modalType: null }
    }

    /**
     * Smart button search - tries multiple scopes and patterns
     */
    private async tryPatternsWithSmartButtonSearch(page: Page, patterns: Array<{name: string, selector: string, method: string}>): Promise<ModalDetectionResult> {
        for (const pattern of patterns) {
            try {
                const modal = page.locator(pattern.selector)
                const isVisible = await modal.isVisible({ timeout: 300 })
                
                if (isVisible) {
                    console.info(`[ModalDetection] Found modal via ${pattern.method}: ${pattern.name}`)
                    
                    // Log modal text content for debugging
                    try {
                        const modalFullText = await modal.textContent({ timeout: 1000 }) || ''
                        const cleanText = modalFullText.trim().replace(/\s+/g, ' ').substring(0, 250)
                        console.log(`[ModalDetection] Modal text: "${cleanText}${modalFullText.length > 250 ? '...' : ''}"`)
                    } catch (textError) {
                        console.warn(`[ModalDetection] Could not retrieve modal text content: ${textError}`)
                    }
                    
                    // Try multiple button search strategies
                    const buttonSearchStrategies = [
                        { scope: modal, name: 'inside modal' },
                        { scope: modal.locator('..'), name: 'parent container' },
                        { scope: modal.locator('../..'), name: 'grandparent container' },
                        { scope: page, name: 'entire page' }
                    ]

                    for (const searchStrategy of buttonSearchStrategies) {
                        try {
                            const result = await this.dismissWithUniversalButtonSearch(page, searchStrategy.scope, pattern.name, searchStrategy.name)
                            if (result.dismissed) {
                                return {
                                    ...result,
                                    detectionMethod: pattern.method
                                }
                            }
                        } catch (searchError) {
                            console.warn(`[ModalDetection] Search strategy "${searchStrategy.name}" failed: ${searchError}`)
                            continue
                        }
                    }
                    
                    return {
                        found: true,
                        dismissed: false,
                        modalType: pattern.name,
                        detectionMethod: pattern.method
                    }
                }
            } catch (error) {
                continue
            }
        }

        return { found: false, dismissed: false, modalType: null }
    }

    /**
     * Universal button search with multiple patterns and behaviors
     */
    private async dismissWithUniversalButtonSearch(page: Page, searchScope: any, modalType: string, scopeName: string): Promise<ModalDetectionResult> {
        console.info(`[ModalDetection] Trying universal button search in: ${scopeName}`)

        // Universal button detection patterns (not dependent on specific classes)
        const buttonPatterns = [
            // Semantic buttons
            'button[aria-label*="close"], button[aria-label*="dismiss"], button[aria-label*="ok"]',
            // Data attributes
            'button[data-action*="close"], button[data-action*="dismiss"], button[data-action*="ok"]',
            // Type attributes
            'button[type="button"], input[type="button"], input[type="submit"]',
            // Generic interactive elements
            'button, [role="button"], [tabindex="0"][onclick]',
            // Links that might act as buttons
            'a[href="#"], a[onclick]'
        ]

        for (const buttonPattern of buttonPatterns) {
            try {
                const buttons = searchScope.locator(buttonPattern)
                const buttonCount = await buttons.count()
                
                if (buttonCount > 0) {
                    console.info(`[ModalDetection] Found ${buttonCount} buttons with pattern: ${buttonPattern}`)
                    
                    // Try clicking visible buttons
                    for (let i = 0; i < buttonCount; i++) {
                        try {
                            const button = buttons.nth(i)
                            const isVisible = await button.isVisible({ timeout: 200 })
                            
                            if (isVisible) {
                                // Check if button looks like a dismiss button
                                const buttonText = await button.textContent({ timeout: 500 }).catch(() => '')
                                const ariaLabel = await button.getAttribute('aria-label').catch(() => '')
                                
                                const dismissIndicators = [
                                    'ok', 'got it', 'dismiss', 'close', 'fermer', 'compris', 
                                    'entendido', 'verstanden', 'capito', 'begrepen', '×', '✕'
                                ]
                                
                                const textToCheck = `${buttonText} ${ariaLabel}`.toLowerCase()
                                const looksLikeDismiss = dismissIndicators.some(indicator => 
                                    textToCheck.includes(indicator.toLowerCase())
                                )
                                
                                if (looksLikeDismiss || buttonCount === 1) { // Single button likely dismisses
                                    console.info(`[ModalDetection] Attempting click on button: "${buttonText}" (${ariaLabel})`)
                                    await button.click({ timeout: 2000 })
                                    await page.waitForTimeout(500)
                                    
                                    return {
                                        found: true,
                                        dismissed: true,
                                        modalType: modalType,
                                        language: LanguagePatterns.detectLanguage(textToCheck)
                                    }
                                }
                            }
                        } catch (buttonError) {
                            continue
                        }
                    }
                }
            } catch (patternError) {
                continue
            }
        }

        // Fallback to text-based search
        return await this.dismissWithTextButtons(page, searchScope, modalType)
    }

    /**
     * Detect language from any text
     */
    private detectLanguageFromText(text: string): string {
        const languageIndicators = {
            'french': ['vous', 'être', 'avoir', 'avec', 'pour', 'dans', 'sur', 'comme', 'tout', 'une', 'par', 'peut', 'ses', 'mais', 'qui', 'que', 'son', 'cette', 'leur', 'nous'],
            'spanish': ['que', 'de', 'no', 'la', 'el', 'es', 'en', 'un', 'ser', 'se', 'te', 'todo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'está', 'como', 'tú'],
            'japanese': ['です', 'である', 'します', 'ます', 'ください', 'さん', 'こと', 'もの', 'ため', 'から', 'まで', 'について', 'により', 'において', 'として', 'による'],
            'chinese_simplified': ['的', '在', '是', '有', '和', '人', '这', '中', '大', '为', '上', '个', '国', '我', '以', '要', '他', '时', '来', '用', '们', '生', '到', '作', '地'],
            'chinese_traditional': ['的', '在', '是', '有', '和', '人', '這', '中', '大', '為', '上', '個', '國', '我', '以', '要', '他', '時', '來', '用', '們', '生', '到', '作', '地'],
            'german': ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als'],
            'portuguese': ['de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais'],
            'italian': ['di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'il', 'lo', 'la', 'le', 'gli', 'un', 'una', 'del', 'della', 'dei', 'delle'],
            'dutch': ['de', 'het', 'een', 'van', 'in', 'te', 'dat', 'die', 'aan', 'op', 'voor', 'met', 'als', 'bij', 'door', 'over', 'tot', 'uit', 'maar', 'om']
        }

        const lowerText = text.toLowerCase()
        
        for (const [language, indicators] of Object.entries(languageIndicators)) {
            const matches = indicators.filter(indicator => lowerText.includes(indicator)).length
            if (matches >= 2) { // Require at least 2 language indicators for confidence
                return language
            }
        }
        
        return 'english' // Default fallback
    }

    /**
     * Enhanced button dismissal with multi-language support
     */
    private async dismissWithTextButtons(page: Page, modal: any, modalType: string): Promise<ModalDetectionResult> {
        const buttonTexts = this.getButtonTextPatterns()
        
        console.log(`[ModalDetection] DEBUG - Starting text-based button dismissal for ${modalType}`)
        console.log(`[ModalDetection] DEBUG - Will try ${buttonTexts.length} button text patterns`)
        
        // Log modal text for context
        await ModalUtils.logModalText(modal, 'Modal text context', 200)
        
        // DEBUG: List all buttons in the modal
        try {
            const allButtons = await modal.locator('button, [role="button"]').count()
            console.log(`[ModalDetection] DEBUG - Found ${allButtons} total buttons in modal`)
            
            for (let i = 0; i < Math.min(allButtons, 5); i++) {
                try {
                    const buttonText = await modal.locator('button, [role="button"]').nth(i).textContent({ timeout: 500 }) || ''
                    const cleanButtonText = buttonText.trim().replace(/\s+/g, ' ').substring(0, 50)
                    console.log(`[ModalDetection] DEBUG - Button ${i}: "${cleanButtonText}"`)
                } catch (buttonError) {
                    console.warn(`[ModalDetection] DEBUG - Could not get text for button ${i}`)
                }
            }
        } catch (error) {
            console.warn(`[ModalDetection] DEBUG - Could not enumerate buttons: ${error}`)
        }
        
        // Try each button text pattern
        for (const buttonText of buttonTexts) {
            console.info(`[ModalDetection] DEBUG - Trying button text: "${buttonText}"`)
            
            try {
                // Try exact text match first
                let button = modal.locator(`button:has-text("${buttonText}")`)
                let buttonCount = await button.count()
                console.info(`[ModalDetection] DEBUG - Exact text "${buttonText}": found ${buttonCount} buttons`)
                
                if (buttonCount > 0 && await button.first().isVisible({ timeout: 200 })) {
                    console.info(`[ModalDetection] DEBUG - Attempting click on exact text button: "${buttonText}"`)
                    await button.first().click({ timeout: 2000 })
                    await page.waitForTimeout(500)
                    console.info(`[ModalDetection] DEBUG - Successfully dismissed ${modalType} with exact text: "${buttonText}"`)
                    return {
                        found: true,
                        dismissed: true,
                        modalType: modalType,
                        language: LanguagePatterns.detectLanguage(buttonText)
                    }
                }

                // Try partial text match
                button = modal.locator(`button:text-matches(".*${buttonText}.*", "i")`)
                buttonCount = await button.count()
                console.info(`[ModalDetection] DEBUG - Partial text "${buttonText}": found ${buttonCount} buttons`)
                
                if (buttonCount > 0 && await button.first().isVisible({ timeout: 200 })) {
                    console.info(`[ModalDetection] DEBUG - Attempting click on partial text button: "${buttonText}"`)
                    await button.first().click({ timeout: 2000 })
                    await page.waitForTimeout(500)
                    console.info(`[ModalDetection] DEBUG - Successfully dismissed ${modalType} with partial text: "${buttonText}"`)
                    return {
                        found: true,
                        dismissed: true,
                        modalType: modalType,
                        language: LanguagePatterns.detectLanguage(buttonText)
                    }
                }

                // Try by span content (for Material Design buttons)
                button = modal.locator(`button span:has-text("${buttonText}")`)
                buttonCount = await button.count()
                console.info(`[ModalDetection] DEBUG - Span text "${buttonText}": found ${buttonCount} buttons`)
                
                if (buttonCount > 0 && await button.first().isVisible({ timeout: 200 })) {
                    console.info(`[ModalDetection] DEBUG - Attempting click on span text button: "${buttonText}"`)
                    await button.first().click({ timeout: 2000 })
                    await page.waitForTimeout(500)
                    console.info(`[ModalDetection] DEBUG - Successfully dismissed ${modalType} with span text: "${buttonText}"`)
                    return {
                        found: true,
                        dismissed: true,
                        modalType: modalType,
                        language: LanguagePatterns.detectLanguage(buttonText)
                    }
                }

            } catch (error) {
                console.warn(`[ModalDetection] DEBUG - Error trying button text "${buttonText}": ${error}`)
                continue
            }
        }

        console.warn(`[ModalDetection] DEBUG - Failed to dismiss ${modalType} with any text pattern`)
        return { found: true, dismissed: false, modalType: modalType }
    }

    /**
     * Enhanced modal detection with custom selectors (backward compatibility)
     */
    async checkForSpecificModal(
        page: Page, 
        selectors: string[], 
        dismissButtonTexts: string[] = this.getButtonTextPatterns()
    ): Promise<ModalDetectionResult> {
        if (!page || page.isClosed()) {
            return { found: false, dismissed: false, modalType: null }
        }

        try {
            for (const selector of selectors) {
                const modal = page.locator(selector)
                const isVisible = await modal.isVisible({ timeout: 300 })
                
                if (isVisible) {
                    console.info(`[ModalDetection] Found custom modal: ${selector}`)
                    
                    const result = await this.dismissWithTextButtons(page, modal, 'custom')
                    if (result.dismissed) return result
                    
                    return {
                        found: true,
                        dismissed: false,
                        modalType: 'custom'
                    }
                }
            }
            
            return { found: false, dismissed: false, modalType: null }
            
        } catch (error) {
            console.error('[ModalDetection] Error in custom modal detection:', error)
            return { found: false, dismissed: false, modalType: null }
        }
    }
} 