// A circle as path data. Many circles of one colour joined into a single
// <Path> draw the same as separate <Circle>s, at a fraction of the native
// views: react-native-svg is slow to mount and redraw hundreds of nodes.
export function circlePath(cx: number, cy: number, r: number) {
  return `M${(cx - r).toFixed(2)} ${cy.toFixed(2)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}
