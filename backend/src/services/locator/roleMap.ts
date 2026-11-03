// Mirrors Mobilewright's own Android role mapping table (see its README's
// "Role Mapping" section) so locators generated here use the same
// getByRole(role, ...) semantics Mobilewright resolves at run time.
const ROLE_TYPE_MAP: Record<string, string[]> = {
  button: ['Button', 'ImageButton'],
  textfield: ['EditText'],
  text: ['TextView', 'Text'],
  image: ['ImageView'],
  switch: ['Switch', 'Toggle'],
  checkbox: ['Checkbox', 'CheckBox'],
  slider: ['SeekBar'],
  list: ['ListView', 'RecyclerView'],
  header: ['Toolbar', 'Header'],
  link: ['Link'],
  listitem: ['LinearLayout', 'RelativeLayout'],
  tab: ['Tab', 'TabBar'],
}

// `className` is frequently a fully-qualified Android class name
// (e.g. "android.widget.Button"), so this matches on a contained type token
// rather than requiring an exact match.
export function classNameToRole(className: string | undefined): string | undefined {
  if (!className) return undefined
  for (const [role, types] of Object.entries(ROLE_TYPE_MAP)) {
    if (types.some((type) => className.includes(type))) return role
  }
  return undefined
}
