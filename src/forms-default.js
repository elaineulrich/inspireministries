// Default form definitions, rebuilt from the original JotForm student application
// and the downloadable Parental / Pastoral reference PDFs. Admins can edit all of
// these from the portal (Admin -> Forms); these are only used to seed the database
// and for "Reset to default".

const f = (id, type, label, extra = {}) => ({ id, type, label, required: true, ...extra });
const opt = (...options) => ({ options });
const yesNo = opt('Yes', 'No');
const yesNoUnsure = opt('Yes', 'No', 'Not sure');
const half = { width: 'half' };
const showRefs = { showOnReferences: true };

const student = {
  title: 'Student Application Form',
  intro:
    'Please complete all sections of this application. Required fields are marked. February 28 is the sign-up deadline. ' +
    'For student signup questions, please contact Joel Byers @ +1(254) 266-9920.\n\n' +
    'Fees: The fee for the 2026 10-Day Bible School is: $150 due at signup, $275 due on the day of sign-in. ' +
    'Please send payment to P.O. Box 1568, Hillsboro, TX 76645, in care of Joel Byers.',
  sections: [
    {
      id: 'student_info',
      title: 'Student Information',
      description: 'Please provide your personal details as the student applicant.',
      fields: [
        f('first_name', 'text', 'Student First Name', { ...half, ...showRefs, role: 'student_first_name' }),
        f('last_name', 'text', 'Student Last Name', { ...half, ...showRefs, role: 'student_last_name' }),
        f('email', 'email', 'Student Email Address', { ...half, ...showRefs, role: 'student_email' }),
        f('phone', 'phone', 'Student Phone Number', { ...half, ...showRefs }),
        f('address', 'address', 'Student Home Address', showRefs),
        f('dob', 'date', 'Date of Birth', { ...half, ...showRefs }),
        f('age', 'number', "Student's Age", { ...half, ...showRefs, min: 10, max: 99 }),
        f('gender', 'radio', 'Gender', { ...opt('Male', 'Female'), ...showRefs }),
      ],
    },
    {
      id: 'general',
      title: 'General Questions',
      description: 'Please answer all questions honestly and completely.',
      fields: [
        f('serving', 'checkbox', "How have you been involved in serving God's Kingdom?", {
          ...opt('Serving in local church', 'Missions', 'Prison Ministry', 'Street Ministry', 'Local School'),
          allowOther: true,
        }),
        f('subjects', 'checkbox', 'What other subjects are of interest to you?',
          opt('The Gospels', 'Who is God/Jesus', 'Old Testament History', "Paul's Epistles", 'Psalms/Proverbs')),
        f('singing', 'radio', 'How much do you enjoy singing/choir?',
          opt('I sing when and wherever I can', 'I sing regularly', 'I sing occasionally', 'I sing only when I need to')),
        f('sing_parts', 'textarea', 'What part(s) do you like to sing?'),
        f('occupation', 'textarea', 'What is your occupation?'),
      ],
    },
    {
      id: 'medical',
      title: 'Medical Information',
      description: 'Please provide any relevant medical information.',
      fields: [
        f('health', 'textarea', 'Do you have any health concerns? If so, please describe below.', { help: 'Type "None" if not applicable.' }),
        f('diet', 'textarea', 'Do you have any dietary restrictions or a special diet? If so, please list below.', { help: 'Type "None" if not applicable.' }),
      ],
    },
    {
      id: 'family',
      title: 'Family Information',
      description: 'This section is required for parental reference for you to attend the Bible School event.',
      fields: [
        f('father_name', 'name', "Father's Full Name"),
        f('father_phone', 'phone', "Father's Phone Number", half),
        f('father_ministry', 'textarea', "Father's Involvement in Ministry"),
        f('mother_name', 'name', "Mother's Full Name"),
        f('mother_phone', 'phone', "Mother's Phone Number", half),
        f('mother_ministry', 'textarea', "Mother's Involvement in Ministry"),
        f('parent_email', 'email', 'Parental Email Address for Parental Reference', {
          role: 'parent_email',
          help: "Please place a valid email address, as we require a parent's reference to complete your application form.",
        }),
        f('emergency_name', 'name', 'Emergency Contact Name'),
        f('emergency_phone', 'phone', 'Emergency Contact Phone Number', half),
      ],
    },
    {
      id: 'church',
      title: 'Church and Pastor Information',
      description: "Please provide your pastor's contact details to also complete a reference for you to attend the Bible School event.",
      fields: [
        f('church_name', 'text', 'Church Name', showRefs),
        f('pastor_name', 'name', "Pastor's Name", { role: 'pastor_name' }),
        f('pastor_email', 'email', "Pastor's Email Address for Pastoral Reference", {
          ...half,
          role: 'pastor_email',
          help: "Please place a valid email address, as we require a pastor's reference to complete your application form.",
        }),
        f('pastor_phone', 'phone', "Pastor's Phone Number", half),
      ],
    },
    {
      id: 'confirm',
      title: 'Confirmation of Application Request',
      description:
        'After you sign and submit, a Parent Reference and Pastoral Reference form will be sent to the email addresses you provided above — ' +
        'or your parent and pastor can fill out and sign their part in person on your device. Please allow time for those references to be completed. ' +
        'Once all required references have been submitted, a member of the Inspire Ministries board will then follow up with you regarding the status of your application.',
      fields: [
        f('agree', 'agreement', 'Student Agreement', {
          text:
            'I certify that the information in this application is true and complete. If accepted, I agree to attend all required classes, ' +
            'respect the leadership and guidelines of Inspire Ministries, and participate fully in the life of the Bible School.',
        }),
        f('student_signature', 'signature', 'Student Signature'),
      ],
    },
  ],
};

const parent = {
  title: 'Parental Reference',
  intro: 'Parents, please complete the following questionnaire and sign at the end. Your answers are confidential and are only seen by the Inspire Ministries board.',
  sections: [
    {
      id: 'parent_info',
      title: 'Parent / Guardian Information',
      description: '',
      fields: [
        f('parent_names', 'text', 'Name of Parents', { role: 'reference_name' }),
        f('parent_phone', 'phone', 'Phone Number', half),
        f('parent_email', 'email', 'Email Address', half),
        f('is_parent', 'radio', 'Are you the parent of the applicant?', opt('Yes', 'No', 'I am a legal guardian')),
        f('lives_home', 'radio', 'Is the applicant living in your home?', yesNo),
      ],
    },
    {
      id: 'spiritual',
      title: 'Spiritual Life',
      description: '',
      fields: [
        f('born_again', 'radio', 'Is the applicant born again?', yesNoUnsure),
        f('relationship_lord', 'radio', "How would you assess the applicant's relationship with the Lord?", opt('Strong', 'Growing', 'Weak', 'Careless')),
        f('baptized', 'radio', 'Is the applicant baptized?', yesNo),
        f('member', 'radio', 'Is the applicant a member of your church?', opt('Yes', 'No', 'Attends another church')),
        f('church_life', 'textarea', 'In what ways is the applicant active in church life?'),
        f('church_involvement', 'radio', 'How involved is the applicant in church?', opt('Very Active', 'Moderate', 'Inactive')),
        f('outside_ministry', 'radio', 'Is the applicant involved in ministry outside the church?', yesNo),
        f('other_ministries', 'textarea', 'In what way is the applicant involved in other ministries?', { required: false }),
        f('spiritual_health', 'radio', "How would you assess the applicant's spiritual health?", opt('Strong', 'Growing', 'Weak', 'Careless')),
      ],
    },
    {
      id: 'family_character',
      title: 'Family & Character',
      description: '',
      fields: [
        f('family_contribution', 'textarea', 'In what ways does the applicant contribute to the family unit?'),
        f('family_influence', 'radio', 'In what way does the applicant influence the family unit?', opt('Excellent', 'Good', 'Bad')),
        f('parent_relationship', 'radio', 'How would you describe the parent-applicant relationship?', opt('Excellent', 'Stable', 'Struggling', 'Dysfunctional')),
        f('sibling_relationship', 'radio', "How would you describe the applicant's relationship with siblings?", opt('Excellent', 'Stable', 'Struggling', 'Dysfunctional', 'No siblings')),
        f('authority', 'radio', "What best describes the applicant's response to authority at home and/or church?", opt('Very good', 'Good', 'Fair', 'Poor', 'Rebellious')),
        f('witness', 'radio', 'Does the applicant have a good Christian witness?', yesNoUnsure),
        f('opposite_gender', 'radio', 'How does the applicant relate with the opposite gender?', opt('Excellent', 'Good', 'Moderate', 'Inappropriately')),
        f('dated', 'radio', 'Has the applicant dated?', yesNo),
        f('moral_purity', 'radio', "What is your assessment of the applicant's moral purity?", opt('Excellent', 'Good', 'Is being restored', 'Struggling')),
        f('discipline', 'radio', "How would you describe the applicant's personal discipline and responsibility?", opt('Perfectionist', 'Dependable', 'Undependable', 'Careless')),
        f('emotional', 'radio', "How would you describe the applicant's emotional stability?", opt('Well adjusted', 'Struggles occasionally', 'Unstable', 'Depressed', 'Disturbed')),
        f('singing', 'radio', 'How much does the applicant enjoy singing?', opt('Sings freely during daily activity', 'Sings occasionally during daily activity', 'Enjoys singing in choir', 'Sings only if needs to')),
        f('sing_parts', 'text', 'What part(s) does the applicant sing in choir?', { required: false }),
        f('describe', 'radio', 'How would you describe the applicant?', opt('A leader', 'Can lead if assigned', 'A follower', 'A loner')),
        f('leadership', 'textarea', 'Please list leadership experiences.', { required: false }),
        f('strengths', 'textarea', "Please list the applicant's remarkable strengths, talents, or weaknesses."),
      ],
    },
    {
      id: 'health_academics',
      title: 'Health, Academics & Interest',
      description: '',
      fields: [
        f('health', 'textarea', 'Please list any health conditions, allergies, or special diets of applicant.', { help: 'Type "None" if not applicable.' }),
        f('honor_preferences', 'radio', 'Does the applicant demonstrate honor for your preferences in clothing, music, etc.?', yesNo),
        f('academic', 'radio', "How would you describe the applicant's academic ability?", opt('Excellent', 'Average', 'Struggles')),
        f('reading', 'radio', 'Does the applicant enjoy reading?', yesNo),
        f('learning_challenges', 'radio', 'Does the applicant experience any learning challenges?', yesNo),
        f('interested', 'radio', 'Is the applicant personally interested in Bible School?', yesNo),
        f('comments', 'textarea', 'Further Comments', { required: false }),
        f('support', 'radio', 'Do you encourage/support applicant attending bible school?', yesNo),
      ],
    },
    {
      id: 'signatures',
      title: 'Signatures',
      description: 'At least one parent or guardian must sign. If both parents are present, please both sign.',
      fields: [
        f('father_signature', 'signature', "Father's Signature", { required: false }),
        f('mother_signature', 'signature', "Mother's Signature", { required: false }),
      ],
    },
  ],
};

const pastor = {
  title: 'Pastoral Reference Form',
  intro: 'Pastors, please complete the following questionnaire and sign at the end. Your answers are confidential and are only seen by the Inspire Ministries board.',
  sections: [
    {
      id: 'leader_info',
      title: 'Church Leader Information',
      description: '',
      fields: [
        f('leader_name', 'text', 'Name of Church Leader', { role: 'reference_name' }),
        f('leader_phone', 'phone', 'Phone Number', half),
        f('leader_email', 'email', 'Email Address', half),
        f('leader_role', 'radio', 'What is your leadership role in the church?', { ...opt('Bishop', 'Pastor', 'Deacon', 'Elder'), allowOther: true }),
        f('known_how_long', 'radio', 'How long have you known the applicant?', opt('1 year', '2-5 years', '6-10 years', 'More than 10 years', 'Lifetime')),
        f('known_how_well', 'radio', 'How well do you know the applicant?', opt('Extremely well', 'Rather well', 'Casually')),
      ],
    },
    {
      id: 'spiritual',
      title: 'Spiritual Life',
      description: '',
      fields: [
        f('born_again', 'radio', 'Is the applicant born again?', yesNoUnsure),
        f('relationship_lord', 'radio', "How would you assess the applicant's relationship with the Lord?", opt('Strong', 'Growing', 'Weak', 'Careless')),
        f('baptized', 'radio', 'Is the applicant baptized?', yesNo),
        f('member', 'radio', 'Is the applicant a member of your church?', yesNo),
        f('church_life', 'textarea', 'In what ways is the applicant active in church life?'),
        f('church_involvement', 'radio', 'How involved is the applicant in church?', opt('Very Active', 'Moderate', 'Inactive')),
        f('outside_ministry', 'radio', 'Is the applicant involved in ministry outside the church?', yesNo),
        f('other_ministries', 'textarea', 'In what way is the applicant involved in other ministries?', { required: false }),
        f('parents_members', 'radio', "Are the applicant's parents members of your church?", yesNo),
      ],
    },
    {
      id: 'family_character',
      title: 'Family & Character',
      description: '',
      fields: [
        f('family_situation', 'radio', "How would you describe the family situation in the applicant's home?", opt('Excellent', 'Stable', 'Struggling', 'Dysfunctional', 'Not sure')),
        f('parent_relationship', 'radio', "How would you describe the applicant's relationship with parents?", opt('Excellent', 'Stable', 'Struggling', 'Dysfunctional')),
        f('family_relationships', 'radio', "How would you describe the applicant's relationships in the family?", opt('Excellent', 'Moderate', 'Weak')),
        f('witness', 'radio', 'Does the applicant have a good Christian witness?', opt('Good', 'Moderate', 'No')),
        f('social', 'radio', 'How would you describe the applicant socially?', opt('Aggressive', 'Outgoing', 'Calm', 'Shy', 'Withdrawn', 'Struggling', 'Unknown')),
        f('opposite_gender', 'radio', 'How does the applicant relate with the opposite gender?', opt('Excellent', 'Moderate', 'Does not relate well')),
        f('emotional', 'radio', "How would you describe the applicant's emotional stability?", opt('Well adjusted', 'Stable', 'Struggles', 'Unstable', 'Depressed', 'Disturbed', 'Unknown')),
        f('moral_purity', 'radio', "What is your assessment of the applicant's moral purity?", opt('Excellent', 'Stable', 'Struggling', 'Failing', 'Unknown')),
        f('standards', 'radio', 'How well does the applicant honor the standards of the church?', opt('Excellent', 'Moderate', 'Poor')),
        f('respectful', 'radio', 'How respectful is the applicant?', opt('Very Respectful', 'Moderate', 'Lacking', 'Not respectful')),
        f('concerns', 'textarea', 'Are there any other concerns why the applicant should or should not attend bible school?', { required: false }),
      ],
    },
    {
      id: 'signature',
      title: 'Signature',
      description: '',
      fields: [f('leader_signature', 'signature', "Leader's Signature")],
    },
  ],
};

module.exports = { student, parent, pastor };
