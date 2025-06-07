import { RecordingMode, SpeakerData } from '../observeSpeakers'

export const SPEAKER_LATENCY = 0 // ms

let lastValidSpeakers: SpeakerData[] = []
let lastValidSpeakerCheck = Date.now()
const FREEZE_TIMEOUT = 30000 // 30 secondes

export async function getSpeakerRootToObserve(
    recordingMode: RecordingMode,
): Promise<[Node, MutationObserverInit] | undefined> {
    if (recordingMode === 'gallery_view') {
        return [
            document,
            {
                attributes: true,
                characterData: false,
                childList: true,
                subtree: true,
                attributeFilter: ['class'],
            },
        ]
    } else {
        try {
            // Find all div elements
            const allDivs = document.querySelectorAll('div')

            // Filter divs to include padding in their size (assuming border-box sizing)
            const filteredDivs = Array.from(allDivs).filter((div) => {
                // Use offsetWidth and offsetHeight to include padding (and border)
                const width = div.offsetWidth
                const height = div.offsetHeight

                return (
                    width === 360 &&
                    (height === 64 ||
                        height === 63 ||
                        height === 50.99 ||
                        height === 51 ||
                        height === 66.63)
                )
            })
            
            // Nous ne supprimons plus ces divs pour ne pas perturber l'interface
            // filteredDivs.forEach((div) => {
            //     div.remove()
            // })

            // Observer le document entier au lieu du panneau participants
            return [
                document,
                {
                    attributes: true,
                    characterData: false,
                    childList: true,
                    subtree: true,
                    attributeFilter: ['class', 'aria-label'],
                },
            ]
        } catch (error) {
            console.error('Error in getSpeakerRootToObserve:', error)
            return [
                document,
                {
                    attributes: true,
                    characterData: false,
                    childList: true,
                    subtree: true,
                    attributeFilter: ['class', 'aria-label'],
                },
            ]
        }
    }
}

// Fonction pour observer toutes les iframes existantes et futures
export function observeIframes(callback: (iframe: HTMLIFrameElement) => void) {
    // Observer les iframes existantes
    document.querySelectorAll('iframe').forEach(iframe => {
        callback(iframe);
    });

    // Observer pour détecter les nouvelles iframes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeName === 'IFRAME') {
                    callback(node as HTMLIFrameElement);
                }
                // Rechercher les iframes dans les sous-éléments ajoutés
                if (node.nodeType === Node.ELEMENT_NODE) {
                    (node as Element).querySelectorAll('iframe').forEach(iframe => {
                        callback(iframe);
                    });
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    return observer;
}

// Fonction pour obtenir un document à partir d'une iframe
export function getIframeDocument(iframe: HTMLIFrameElement): Document | null {
    try {
        // Vérifier si l'iframe est accessible (même origine)
        return iframe.contentDocument || iframe.contentWindow?.document || null;
    } catch (error) {
        // Si l'iframe est cross-origin, on ne peut pas y accéder
        console.log('Cannot access iframe content (likely cross-origin):', error);
        return null;
    }
}

export function getSpeakerFromDocument(
    _recordingMode: RecordingMode,
    timestamp: number,
): SpeakerData[] {
    try {
        // Vérifier si la page est gelée
        const currentTime = Date.now()
        if (currentTime - lastValidSpeakerCheck > FREEZE_TIMEOUT) {
            return []
        }

        const participantsList = document.querySelector(
            "[aria-label='Participants']",
        )
        if (!participantsList) {
            lastValidSpeakers = []
            return [] // Vrai cas de 0 participants
        }

        const participantItems =
            participantsList.querySelectorAll('[role="listitem"]')

        if (!participantItems || participantItems.length === 0) {
            lastValidSpeakers = [] // Mettre à jour l'état
            return []
        }

        // Map to store unique participants with their speaking status
        const uniqueParticipants = new Map<
            string,
            {
                name: string
                isSpeaking: boolean
                isPresenting: boolean
                isInMergedAudio: boolean
                cohortId: string | null
            }
        >()

        // Structure pour les groupes fusionnés
        const mergedGroups = new Map<
            string,
            {
                isSpeaking: boolean
                members: string[]
            }
        >()

        // Première passe: identifier tous les participants
        for (let i = 0; i < participantItems.length; i++) {
            const item = participantItems[i]
            const ariaLabel = item.getAttribute('aria-label')?.trim()

            if (!ariaLabel) continue

            // Vérifier si cet élément est "Merged audio"
            const isMergedAudio = ariaLabel === 'Merged audio'

            // Obtenir le cohort-id pour les groupes fusionnés
            let cohortId: string | null = null
            if (isMergedAudio) {
                // Chercher le cohort-id dans l'élément parent
                const cohortElement = item.closest('[data-cohort-id]')
                if (cohortElement) {
                    cohortId = cohortElement.getAttribute('data-cohort-id')
                }

                // Vérifier si l'audio fusionné parle
                const speakingIndicators = Array.from(
                    item.querySelectorAll('*'),
                ).filter((elem) => {
                    const color = getComputedStyle(elem).backgroundColor
                    return (
                        color === 'rgba(26, 115, 232, 0.9)' ||
                        color === 'rgb(26, 115, 232)'
                    )
                })

                // Vérifier aussi l'icône de micro non muet
                const unmutedMicImg = item.querySelector(
                    'img[src*="mic_unmuted"]',
                )

                const isSpeaking =
                    speakingIndicators.length > 0 || !!unmutedMicImg

                // Initialiser le groupe fusionné
                if (cohortId) {
                    mergedGroups.set(cohortId, {
                        isSpeaking: isSpeaking,
                        members: [],
                    })
                }
            }

            // Vérifier si ce participant fait partie d'un groupe audio fusionné
            const isInMergedAudio = !!item.querySelector(
                '[aria-label="Adaptive audio group"]',
            )
            let participantCohortId: string | null = null

            if (isInMergedAudio) {
                // Chercher le cohort-id dans l'élément parent
                const cohortElement = item.closest('[data-cohort-id]')
                if (cohortElement) {
                    participantCohortId =
                        cohortElement.getAttribute('data-cohort-id')
                }

                // Ajouter ce participant au groupe fusionné correspondant
                if (
                    participantCohortId &&
                    mergedGroups.has(participantCohortId)
                ) {
                    mergedGroups
                        .get(participantCohortId)!
                        .members.push(ariaLabel)
                }
            }

            // Ajouter le participant à notre map seulement s'il n'est pas dans un groupe fusionné
            // ou s'il est l'entrée "Merged audio" elle-même
            if (isMergedAudio || !isInMergedAudio) {
                const uniqueKey =
                    isMergedAudio && cohortId
                        ? `Merged audio_${cohortId}`
                        : ariaLabel

                if (!uniqueParticipants.has(uniqueKey)) {
                    uniqueParticipants.set(uniqueKey, {
                        name: ariaLabel,
                        isSpeaking: false,
                        isPresenting: false,
                        isInMergedAudio: isMergedAudio,
                        cohortId: isMergedAudio ? cohortId : null,
                    })
                }

                const participant = uniqueParticipants.get(uniqueKey)!

                // Vérifier si le participant présente
                const allDivs = Array.from(item.querySelectorAll('div'))
                const isPresenting = allDivs.some((div) => {
                    const text = div.textContent?.trim()
                    return text === 'Presentation'
                })

                if (isPresenting) {
                    participant.isPresenting = true
                }

                // Vérifier les indicateurs de parole
                const speakingIndicators = Array.from(
                    item.querySelectorAll('*'),
                ).filter((elem) => {
                    const color = getComputedStyle(elem).backgroundColor
                    return (
                        color === 'rgba(26, 115, 232, 0.9)' ||
                        color === 'rgb(26, 115, 232)'
                    )
                })

                speakingIndicators.forEach((indicator) => {
                    const backgroundElement = indicator.children[1]
                    if (backgroundElement) {
                        const backgroundPosition =
                            getComputedStyle(
                                backgroundElement,
                            ).backgroundPositionX
                        if (backgroundPosition !== '0px') {
                            participant.isSpeaking = true
                        }
                    }
                })

                // Mettre à jour la map avec les données potentiellement modifiées
                uniqueParticipants.set(uniqueKey, participant)
            }
        }

        // Remplacer les noms des groupes fusionnés par les noms des membres
        for (const [key, participant] of uniqueParticipants.entries()) {
            if (
                participant.name === 'Merged audio' &&
                participant.cohortId &&
                mergedGroups.has(participant.cohortId)
            ) {
                const members = mergedGroups.get(participant.cohortId)!.members
                if (members.length > 0) {
                    participant.name = members.join(', ')
                    uniqueParticipants.set(key, participant)
                }
            }
        }

        // Créer la liste finale des participants
        const speakers = Array.from(uniqueParticipants.values()).map(
            (participant) => ({
                name: participant.name,
                id: 0,
                timestamp,
                isSpeaking: participant.isSpeaking,
            }),
        )

        lastValidSpeakers = speakers
        lastValidSpeakerCheck = currentTime
        return speakers
    } catch (e) {
        return lastValidSpeakers
    }
}

// export function findAllAttendees(): string[] {
//     let images = document.querySelectorAll('img')

//     let participants = Array.from(images).filter(
//         (img) => img.clientWidth === 32 && img.clientHeight === 32,
//     )
//     const names: string[] = []
//     // https://www.lifewire.com/change-your-name-on-google-meet-5112077
//     for (const participant of participants) {
//         let currentElement: any = participant

//         while (currentElement) {
//             // Check if this parent has a child span
//             const span = currentElement.querySelector('span')
//             if (span) {
//                 // Found a parent with a child span
//                 names.push(span.innerText)
//                 break
//             }

//             // Move to the next parent
//             currentElement = currentElement.parentElement
//         }
//     }
//     return names
// }

// Dans votre fonction qui initialise l'observation des haut-parleurs
const iframeObserver = observeIframes((iframe) => {
    const iframeDoc = getIframeDocument(iframe);
    if (iframeDoc) {
        // Créer un nouvel observateur pour le contenu de l'iframe
        const observer = new MutationObserver((mutations) => {
            // Même logique que votre observateur principal
            // Traiter les mutations pour détecter les changements de haut-parleurs
        });
        
        // Observer le document de l'iframe avec les mêmes paramètres
        observer.observe(iframeDoc, {
            attributes: true,
            characterData: false,
            childList: true,
            subtree: true,
            attributeFilter: ['class', 'aria-label'],
        });
    }
});

// Stockez cet iframeObserver pour pouvoir le déconnecter plus tard si nécessaire
