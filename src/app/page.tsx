import GuestJournal from './components/GuestJournal';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Michio</h1>
        <p className={styles.subtitle}>
          &quot;Man on a Journey&quot; — Every step is a story, every pause a reflection.
          Capture your thoughts as you wander through the digital expanse.
        </p>
      </div>

      <div className={styles.journeyPath} aria-hidden="true" />

      <GuestJournal />
    </main>
  );
}
