/** Exporte la vue courante en PNG (bibliothèque chargée à la demande pour ne pas alourdir la page). */
export async function exportPng(container: HTMLElement, theme: 'dark' | 'light') {
  const { toPng } = await import('html-to-image')
  const target = container.querySelector('.react-flow') as HTMLElement
  const url = await toPng(target, {
    backgroundColor: theme === 'dark' ? '#090f1b' : '#f3f6fb', pixelRatio: 2,
    filter: (n) => !(n instanceof HTMLElement && (n.classList.contains('react-flow__minimap') || n.classList.contains('react-flow__controls'))),
  })
  const a = document.createElement('a')
  a.href = url; a.download = `organigramme-${new Date().toISOString().slice(0, 10)}.png`; a.click()
}
