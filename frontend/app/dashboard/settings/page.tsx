import styles from "../dashboard.module.css";

export default function SettingsPage() {
  return (
    <div className={styles.settingsView}>
      <h1 className={styles.viewTitle}>Settings</h1>
      <p className={styles.viewSubtitle}>Manage your account and preferences</p>
      {/* Settings content will be added here */}
    </div>
  );
}
