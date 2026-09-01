(function () {
    const parseUnits = raw => raw.trim().split('\n').filter(Boolean).map(line => {
        const [name, ...subs] = line.split('|').map(part => part.trim()).filter(Boolean);
        return subs.length ? { name, subs } : name;
    });

    const computerScienceUnits = parseUnits(`
1 Information representation|1.1 Data Representation|1.2 Multimedia|1.3 Compression
2 Communication|2.1 Networks including the internet
3 Hardware|3.1 Computers and their components|3.2 Logic Gates and Logic Circuits
4 Processor Fundamentals|4.1 Central Processing Unit (CPU) Architecture|4.2 Assembly Language|4.3 Bit manipulation
5 System Software|5.1 Operating Systems|5.2 Language Translators
6 Security, privacy and data integrity|6.1 Data Security|6.2 Data Integrity
7 Ethics and Ownership|7.1 Ethics and Ownership
8 Databases|8.1 Database Concepts|8.2 Database Management Systems (DBMS)|8.3 Data Definition Language (DDL) and Data Manipulation Language (DML)
9 Algorithm Design and Problem-solving|9.1 Computational Thinking Skills|9.2 Algorithms
10 Data Types and Structures|10.1 Data Types and Records|10.2 Arrays|10.3 Files|10.4 Introduction to Abstract Data Types (ADT)
11 Programming|11.1 Programming Basics|11.2 Constructs|11.3 Structured Programming
12 Software Development|12.1 Program Development Life cycle|12.2 Program Design|12.3 Program Testing and Maintenance
13 Data Representation|13.1 User-defined data types|13.2 File organisation and access|13.3 Floating-point numbers, representation and manipulation
14 Communication and internet technologies|14.1 Protocols|14.2 Circuit switching, packet switching
15 Hardware and Virtual Machines|15.1 Processors, Parallel Processing and Virtual Machines|15.2 Boolean Algebra and Logic Circuits
16 System Software|16.1 Purposes of an Operating System (OS)|16.2 Translation Software
17 Security|17.1 Encryption, Encryption Protocols and Digital Certificates
18 Artificial Intelligence (AI)|18.1 Artificial Intelligence (AI)
19 Computational thinking and Problem-solving|19.1 Algorithms|19.2 Recursion
20 Further Programming|20.1 Programming Paradigms|20.2 File Processing and Exception Handling`);

    const physicsUnits = parseUnits(`
1 Physical quantities and units|1.1 Physical quantities|1.2 SI units|1.3 Errors and uncertainties|1.4 Scalars and vectors
2 Kinematics|2.1 Equations of motion
3 Dynamics|3.1 Momentum and Newton’s laws of motion|3.2 Non-uniform motion|3.3 Linear momentum and its conservation
4 Forces, density and pressure|4.1 Turning effects of forces|4.2 Equilibrium of forces|4.3 Density and pressure
5 Work, energy and power|5.1 Energy conservation|5.2 Gravitational potential energy and kinetic energy
6 Deformation of solids|6.1 Stress and strain|6.2 Elastic and plastic behaviour
7 Waves|7.1 Progressive waves|7.2 Transverse and longitudinal waves|7.3 Doppler effect for sound waves|7.4 Electromagnetic spectrum|7.5 Polarisation
8 Superposition|8.1 Stationary waves|8.2 Diffraction|8.3 Interference|8.4 The diffraction grating
9 Electricity|9.1 Electric current|9.2 Potential difference and power|9.3 Resistance and resistivity
10 D.C. circuits|10.1 Practical circuits|10.2 Kirchhoff’s laws|10.3 Potential dividers
11 Particle physics|11.1 Atoms, nuclei and radiation|11.2 Fundamental particles
12 Motion in a circle|12.1 Kinematics of uniform circular motion|12.2 Centripetal acceleration
13 Gravitational fields|13.1 Gravitational field|13.2 Gravitational force between point masses|13.3 Gravitational field of a point mass|13.4 Gravitational potential
14 Temperature|14.1 Thermal equilibrium|14.2 Temperature scales|14.3 Specific heat capacity and specific latent heat
15 Ideal gases|15.1 The mole|15.2 Equation of state|15.3 Kinetic theory of gases
16 Thermodynamics|16.1 Internal energy|16.2 The first law of thermodynamics
17 Oscillations|17.1 Simple harmonic oscillations|17.2 Energy in simple harmonic motion|17.3 Damped and forced oscillations, resonance
18 Electric fields|18.1 Electric fields and field lines|18.2 Uniform electric fields|18.3 Electric force between point charges|18.4 Electric field of a point charge|18.5 Electric potential
19 Capacitance|19.1 Capacitors and capacitance|19.2 Energy stored in a capacitor|19.3 Discharging a capacitor
20 Magnetic fields|20.1 Concept of a magnetic field|20.2 Force on a current-carrying conductor|20.3 Force on a moving charge|20.4 Magnetic fields due to currents|20.5 Electromagnetic induction
21 Alternating currents|21.1 Characteristics of alternating currents|21.2 Rectification and smoothing
22 Quantum physics|22.1 Energy and momentum of a photon|22.2 Photoelectric effect|22.3 Wave-particle duality|22.4 Energy levels in atoms and line spectra
23 Nuclear physics|23.1 Mass defect and nuclear binding energy|23.2 Radioactive decay
24 Medical physics|24.1 Production and use of ultrasound|24.2 Production and use of X-rays|24.3 PET scanning
25 Astronomy and cosmology|25.1 Standard candles|25.2 Stellar radii|25.3 Hubble’s law and the Big Bang theory`);

    // Edexcel IAL uses Unit -> numbered topic, unlike CAIE's section -> subsection structure.
    const mathematicsUnits = parseUnits(`
Unit P1 — Pure Mathematics 1|P1.1 Algebra and functions|P1.2 Coordinate geometry in the (x, y) plane|P1.3 Trigonometry|P1.4 Differentiation|P1.5 Integration
Unit P2 — Pure Mathematics 2|P2.1 Proof|P2.2 Algebra and functions|P2.3 Coordinate geometry in the (x, y) plane|P2.4 Sequences and series|P2.5 Exponentials and logarithms|P2.6 Trigonometry|P2.7 Differentiation|P2.8 Integration
Unit P3 — Pure Mathematics 3|P3.1 Algebra and functions|P3.2 Trigonometry|P3.3 Exponential and logarithms|P3.4 Differentiation|P3.5 Integration|P3.6 Numerical methods
Unit P4 — Pure Mathematics 4|P4.1 Proof|P4.2 Algebra and functions|P4.3 Coordinate geometry in the (x, y) plane|P4.4 Binomial expansion|P4.5 Differentiation|P4.6 Integration|P4.7 Vectors
Unit M1 — Mechanics 1|M1.1 Mathematical models in mechanics|M1.2 Vectors in mechanics|M1.3 Kinematics of a particle moving in a straight line|M1.4 Dynamics of a particle moving in a straight line or plane|M1.5 Statics of a particle|M1.6 Moments
Unit S1 — Statistics 1|S1.1 Mathematical models in probability and statistics|S1.2 Representation and summary of data|S1.3 Probability|S1.4 Correlation and regression|S1.5 Discrete random variables|S1.6 The Normal distribution`);

    const subjects = {
        cs2026: {
            subject: 'Computer Science (9618) — 2026',
            board: 'CAIE',
            source: '9618 syllabus for examination in 2026',
            units: computerScienceUnits,
        },
        cs2027: {
            subject: 'Computer Science (9618) — 2027–2029',
            board: 'CAIE',
            source: '9618 syllabus for examination in 2027, 2028 and 2029',
            units: computerScienceUnits,
        },
        physics: {
            subject: 'Physics (9702) — 2025–2027',
            board: 'CAIE',
            source: '9702 syllabus for examination in 2025, 2026 and 2027',
            units: physicsUnits,
        },
        mathematics: {
            subject: 'Edexcel IAL Mathematics — Issue 3',
            board: 'Pearson Edexcel',
            source: 'IAL Mathematics 2018 specification, Issue 3 (P1–P4, M1, S1)',
            units: mathematicsUnits,
        },
    };

    const plans = {
        all2026: {
            label: '2026 考试 · 全科方案',
            description: 'Computer Science 使用 2026 syllabus；Physics 使用 2025–2027 syllabus；Mathematics 使用 Edexcel IAL 2018 Issue 3。',
            subjectKeys: ['cs2026', 'physics', 'mathematics'],
        },
        all2027: {
            label: '2027 考试 · 全科方案',
            description: 'Computer Science 使用 2027–2029 syllabus；Physics 使用 2025–2027 syllabus；Mathematics 使用 Edexcel IAL 2018 Issue 3。',
            subjectKeys: ['cs2027', 'physics', 'mathematics'],
        },
        cs2026: { label: '仅 Computer Science 9618 · 2026', description: subjects.cs2026.source, subjectKeys: ['cs2026'] },
        cs2027: { label: '仅 Computer Science 9618 · 2027–2029', description: subjects.cs2027.source, subjectKeys: ['cs2027'] },
        physics: { label: '仅 Physics 9702 · 2025–2027', description: subjects.physics.source, subjectKeys: ['physics'] },
        mathematics: { label: '仅 Edexcel IAL Mathematics', description: subjects.mathematics.source, subjectKeys: ['mathematics'] },
    };

    window.STUDYPLAN_SYLLABUS_PRESETS = { plans, subjects };
})();
