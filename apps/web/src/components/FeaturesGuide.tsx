import { Button } from "@ops-vault/ui";

/** Bump this key when feature map changes so the guide reappears once. */
export const GUIDE_STORAGE_KEY = "ops-vault.guideDismissed.v2";

/**
 * Always-visible map of features so nothing feels "missing".
 */
export function FeaturesGuide({
  onNewPassword,
  onOpenSettings,
  onOpenPrivacy,
  onOpenWorkspace,
  onNewFolder,
  dismissed,
  onDismiss,
}: {
  onNewPassword: () => void;
  onOpenSettings: (tab: "security" | "privacy" | "workspace" | "backup") => void;
  onOpenPrivacy: () => void;
  onOpenWorkspace: () => void;
  onNewFolder: () => void;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  if (dismissed) {
    return (
      <div className="rounded-lg border border-[var(--ov-border)] bg-[var(--ov-soft)] px-3 py-2">
        <button
          type="button"
          onClick={onDismiss}
          className="text-sm font-medium text-cyan-700 underline dark:text-cyan-400"
        >
          Afficher le guide des fonctionnalités (édition, partage, espaces…)
        </button>
      </div>
    );
  }

  const items: Array<{
    title: string;
    how: string;
    action?: () => void;
    actionLabel?: string;
  }> = [
    {
      title: "Éditer un secret",
      how: "Cliquez une ligne → panneau à droite → bouton Modifier",
    },
    {
      title: "Générateur de mot de passe",
      how: "Nouveau → type Mots de passe → lien « Générateur » (aussi en édition)",
      action: onNewPassword,
      actionLabel: "Créer un mot de passe",
    },
    {
      title: "Favicon / monogramme",
      how: "Ajoutez une URL sur un mot de passe — l’icône du site apparaît dans la liste",
    },
    {
      title: "Glisser vers un dossier",
      how: "Créez un dossier (sidebar), puis glissez une ligne dessus",
      action: onNewFolder,
      actionLabel: "Créer un dossier",
    },
    {
      title: "Partager un secret",
      how: "Ouvrir le secret → Partager → MDP + expiration + nombre de vues",
    },
    {
      title: "Espace de travail",
      how: "Réglages → Espaces → créer · inviter (admin/member/viewer)",
      action: onOpenWorkspace,
      actionLabel: "Ouvrir Espaces",
    },
    {
      title: "Réinitialiser le MDP maître",
      how: "Réglages → Sécurité → changer / réinitialiser le mot de passe maître",
      action: () => onOpenSettings("security"),
      actionLabel: "Ouvrir Sécurité",
    },
    {
      title: "Confidentialité & fuites",
      how: "Réglages → Confidentialité · politique MDP · vérif. Have I Been Pwned",
      action: onOpenPrivacy,
      actionLabel: "Ouvrir Confidentialité",
    },
  ];

  return (
    <div className="rounded-xl border border-cyan-600/30 bg-cyan-500/5 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ov-fg)]">
            Guide rapide — où sont les fonctions ?
          </h3>
          <p className="mt-0.5 text-xs text-[var(--ov-muted)]">
            Tout est déjà dans l’app. Utilisez la sidebar gauche et le panneau
            détail à droite.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          Masquer
        </Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <li
            key={it.title}
            className="rounded-lg border border-[var(--ov-border)] bg-[var(--ov-panel)] px-3 py-2.5"
          >
            <p className="text-sm font-medium text-[var(--ov-fg)]">{it.title}</p>
            <p className="mt-0.5 text-xs text-[var(--ov-muted)]">{it.how}</p>
            {it.action && it.actionLabel && (
              <button
                type="button"
                onClick={it.action}
                className="mt-1.5 text-xs font-medium text-cyan-600 hover:underline dark:text-cyan-400"
              >
                {it.actionLabel} →
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
