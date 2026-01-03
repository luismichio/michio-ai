import Link from 'next/link';
import styles from './landing.module.css';
import Icon from '@/components/Icon';

export default function LandingPage() {
  return (
    <main className={styles.container}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Meechi</h1>
        <p className={styles.subtitle}>
          A private cognitive layer designed to walk beside you. 
          The wise peer that documents your journey, connects your thoughts, 
          and helps you navigate life with clarity.
        </p>
      </div>

      <div className={styles.manifesto}>
        
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon name="Shield" size={24} /> The Digital Sanctuary
          </h2>
          <div className={styles.sectionContent}>
            Your thoughts are the most private thing you own. In an era where every keystroke is mined, Meechi stands as a sanctuary.
            <ul className={styles.features}>
              <li><Icon name="Check" size={14} /> Zero-Cloud Intelligence: Your Sage lives in your browser.</li>
              <li><Icon name="Check" size={14} /> Data Sovereignty: You own the keys, the memory, and the path.</li>
            </ul>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
             <Icon name="Compass" size={24} /> Presence Over Achievement
          </h2>
          <div className={styles.sectionContent}>
            Rooted in the Japanese concept of Michi (道)—meaning "The Path". We focus on how you navigate your journey, not just what you achieved.
            <ul className={styles.features}>
              <li><Icon name="Check" size={14} /> The Journal is the Path: A "Ship’s Log" for your life.</li>
              <li><Icon name="Check" size={14} /> Reflection as a Mirror: Clarity for life's complexities.</li>
            </ul>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
             <Icon name="WifiOff" size={24} /> Intelligence Without the Tether
          </h2>
          <div className={styles.sectionContent}>
             A true companion should be there when you are offline, deep in thought, or away from the noise.
             <ul className={styles.features}>
              <li><Icon name="Check" size={14} /> Offline-First Resilience: Journal and search without internet.</li>
              <li><Icon name="Check" size={14} /> Zero-Lag Flow: Reactions at the speed of thought.</li>
            </ul>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
             <Icon name="Fingerprint" size={24} /> Bring Your Own Soul
          </h2>
          <div className={styles.sectionContent}>
            Designed for the individual who values autonomy. An extension of your own cognitive capabilities.
            <ul className={styles.features}>
              <li><Icon name="Check" size={14} /> BYO Brain: Use the AI models you trust.</li>
              <li><Icon name="Check" size={14} /> BYO Memory: Connect your personal data continuously.</li>
            </ul>
          </div>
        </div>

      </div>

      <div className={styles.cta}>
        <Link href="/app" className={styles.button}>
          Begin Journey <Icon name="ArrowRight" size={20} />
        </Link>
        <div style={{ marginTop: '1rem', fontSize: '0.8rem', opacity: 0.6 }}>
            v0.9.98 - The Writer's Studio
        </div>
      </div>
    </main>
  );
}
