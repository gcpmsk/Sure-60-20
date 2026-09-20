import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuestions,parseAnswers} from '../src/pdf.js';
test('extracts numbered MCQs with four options',()=>{const q=parseQuestions('1. What is 2 + 2?\nA) 2\nB) 3\nC) 4\nD) 5\n2. Capital?\nA. X\nB. Y\nC. Z\nD. W');assert.equal(q.length,2);assert.deepEqual(q[0].options,['2','3','4','5']);assert.equal(q[1].body,'Capital?')});
test('supports prefixed numbers and multiline questions',()=>{const q=parseQuestions('Q1) A long question\nwith a second line\na) One\nb) Two\nc) Three\nd) Four');assert.equal(q.length,1);assert.match(q[0].body,/second line/)});
test('does not invent options for incomplete/scanned content',()=>{assert.deepEqual(parseQuestions(''),[]);assert.deepEqual(parseQuestions('1. Missing\nA) One\nB) Two'),[])});
test('parses separate answer keys and rejects non-options',()=>{assert.deepEqual(parseAnswers('1. C\n2: A\n3-B\n4) d\n5. E'),{1:2,2:0,3:1,4:3})});
