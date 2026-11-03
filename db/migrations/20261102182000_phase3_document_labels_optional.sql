-- Les exigences sont informatives pour le moment : elles ne bloquent aucune sauvegarde.
update public.document_requirements
set required = false;

-- Les libellés sont écrits en échappements Unicode SQL afin de rester corrects
-- quel que soit l'encodage du client psql utilisé pour appliquer la migration.
update public.document_requirements set
  title = case code
    when 'piece_identite' then U&'Pi\00E8ce d\2019identit\00E9'
    when 'acte_naissance' then U&'Acte de naissance'
    when 'nationalite_residence' then U&'Nationalit\00E9 et r\00E9sidence'
    when 'casier_judiciaire' then U&'Casier judiciaire'
    when 'photo_identite' then U&'Photo d\2019identit\00E9'
    when 'contacts_urgence' then U&'Contacts d\2019urgence'
    when 'cv' then U&'CV \00E0 jour'
    when 'diplomes_attestations' then U&'Dipl\00F4mes et attestations'
    when 'certificats_travail' then U&'Certificats de travail'
    when 'situation_matrimoniale' then U&'Situation matrimoniale'
    when 'actes_enfants' then U&'Actes de naissance des enfants'
    when 'certificats_scolarite' then U&'Certificats de scolarit\00E9'
    when 'immatriculation_sociale' then U&'Immatriculation sociale'
    when 'aptitude_medicale' then U&'Certificat m\00E9dical d\2019aptitude'
    when 'absence_medicale_maternite' then U&'Absence m\00E9dicale ou maternit\00E9'
    when 'permis_visa' then U&'Permis de travail et visa'
    when 'autorisation_parentale' then U&'Autorisation parentale'
    else title
  end,
  description = case code
    when 'piece_identite' then U&'CIN, passeport, carte biom\00E9trique ou titre de s\00E9jour en cours de validit\00E9.'
    when 'acte_naissance' then U&'Acte ou extrait de jugement suppl\00E9tif.'
    when 'nationalite_residence' then U&'Certificat de nationalit\00E9 et certificat de r\00E9sidence.'
    when 'casier_judiciaire' then U&'Bulletin n\00B03 de moins de trois mois.'
    when 'photo_identite' then U&'Photo r\00E9cente au format portrait.'
    when 'contacts_urgence' then U&'Fiche d\2019adresse et deux personnes \00E0 pr\00E9venir.'
    when 'cv' then U&'Curriculum vitae \00E0 jour.'
    when 'diplomes_attestations' then U&'Copies certifi\00E9es des qualifications.'
    when 'certificats_travail' then U&'Certificats des emplois pr\00E9c\00E9dents.'
    when 'situation_matrimoniale' then U&'Acte de mariage, c\00E9libat ou divorce.'
    when 'actes_enfants' then U&'Justificatifs n\00E9cessaires aux allocations et droits sociaux.'
    when 'certificats_scolarite' then U&'Certificats annuels des enfants \00E0 charge.'
    when 'immatriculation_sociale' then U&'Num\00E9ros CNSS, IPRES ou justificatif d\2019immatriculation.'
    when 'aptitude_medicale' then U&'Certificat d\00E9livr\00E9 par la m\00E9decine du travail, de moins de trois mois.'
    when 'absence_medicale_maternite' then U&'Justificatif d\2019arr\00EAt maladie ou de cong\00E9 maternit\00E9, si applicable.'
    when 'permis_visa' then U&'Autorisation, permis de travail et visa pour les \00E9trangers.'
    when 'autorisation_parentale' then U&'Autorisation du repr\00E9sentant l\00E9gal pour les salari\00E9s mineurs.'
    else description
  end;

notify pgrst, 'reload schema';
